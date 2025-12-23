import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { similarity } from 'ml-distance';
import { EmbeddingService } from './embedding.service';
import { IndexStorageService } from './index-storage.service';
import { SearchOptions } from '../interfaces/search-options.interface';
import { SearchResult } from '../dto/search-result.dto';
import { Chunk } from '../entities/chunk.entity';
import { Document } from '../entities/document.entity';

/**
 * Сервис для семантического поиска
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly defaultTopK: number;
  private readonly defaultMinScore: number;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly indexStorageService: IndexStorageService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTopK =
      this.configService.get<number>('indexing.search.defaultTopK') || 5;
    this.defaultMinScore =
      this.configService.get<number>('indexing.search.minScore') || 0.3;
  }

  /**
   * Семантический поиск по индексированным документам
   */
  async semanticSearch(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    try {
      const topK = options.topK || this.defaultTopK;
      const minScore = options.minScore ?? this.defaultMinScore;

      this.logger.log(`Начало семантического поиска: "${query}" (topK: ${topK}, minScore: ${minScore})`);

      // 1. Генерация эмбеддинга для запроса
      const queryEmbedding = await this.embeddingService.generateEmbedding(
        query,
      );
      this.logger.debug(
        `Эмбеддинг запроса сгенерирован (размерность: ${queryEmbedding.length})`,
      );

      // 2. Загрузка всех эмбеддингов из БД
      const allEmbeddings = this.indexStorageService.getAllEmbeddings();
      this.logger.log(`Загружено эмбеддингов из БД: ${allEmbeddings.length}`);

      if (allEmbeddings.length === 0) {
        this.logger.warn('База данных не содержит эмбеддингов');
        return [];
      }

      // 3. Вычисление cosine similarity для каждого вектора
      const similarities: Array<{
        chunkId: string;
        chunk: Chunk;
        score: number;
      }> = [];

      for (const item of allEmbeddings) {
        // Пропускаем пустые векторы (failed эмбеддинги)
        if (item.vector.length === 0) {
          continue;
        }

        // Проверка размерности
        if (item.vector.length !== queryEmbedding.length) {
          this.logger.warn(
            `Несовпадение размерности векторов: запрос ${queryEmbedding.length}, чанк ${item.vector.length}`,
          );
          continue;
        }

        // Вычисление cosine similarity через ml-distance
        const cosineSimilarity = similarity.cosine(queryEmbedding, item.vector);

        // Фильтрация по minScore
        if (cosineSimilarity >= minScore) {
          similarities.push({
            chunkId: item.chunkId,
            chunk: item.chunk,
            score: cosineSimilarity,
          });
        }
      }

      this.logger.log(
        `Найдено релевантных чанков: ${similarities.length} (после фильтрации по minScore)`,
      );

      // 4. Применение фильтров по метаданным
      let filteredSimilarities = similarities;

      if (options.filters) {
        if (options.filters.documentIds && options.filters.documentIds.length > 0) {
          filteredSimilarities = filteredSimilarities.filter((item) =>
            options.filters!.documentIds!.includes(item.chunk.documentId),
          );
          this.logger.log(
            `После фильтрации по documentIds: ${filteredSimilarities.length} чанков`,
          );
        }

        if (options.filters.tags && options.filters.tags.length > 0) {
          // Получаем документы для проверки тегов
          const documentIds = new Set(
            filteredSimilarities.map((item) => item.chunk.documentId),
          );
          const documents = new Map<string, Document>();

          for (const docId of documentIds) {
            const doc = this.indexStorageService.getDocumentById(docId);
            if (doc) {
              documents.set(docId, doc);
            }
          }

          filteredSimilarities = filteredSimilarities.filter((item) => {
            const doc = documents.get(item.chunk.documentId);
            if (!doc) {
              return false;
            }

            try {
              const metadata = JSON.parse(doc.metadata);
              const docTags = metadata.tags || [];
              return options.filters!.tags!.some((tag) =>
                docTags.includes(tag),
              );
            } catch {
              return false;
            }
          });

          this.logger.log(
            `После фильтрации по tags: ${filteredSimilarities.length} чанков`,
          );
        }
      }

      // 5. Сортировка по убыванию similarity
      filteredSimilarities.sort((a, b) => b.score - a.score);

      // 6. Взятие top-K результатов
      const topResults = filteredSimilarities.slice(0, topK);

      // 7. Формирование результатов с информацией о документах
      const results: SearchResult[] = [];

      for (let i = 0; i < topResults.length; i++) {
        const item = topResults[i];
        const document = this.indexStorageService.getDocumentById(
          item.chunk.documentId,
        );

        if (!document) {
          this.logger.warn(
            `Документ не найден для чанка ${item.chunkId}`,
          );
          continue;
        }

        let documentTitle = document.title || '';
        if (!documentTitle) {
          try {
            const metadata = JSON.parse(document.metadata);
            documentTitle = metadata.title || document.filepath;
          } catch {
            documentTitle = document.filepath;
          }
        }

        results.push({
          chunk: item.chunk,
          score: item.score,
          rank: i + 1,
          document: {
            id: document.id,
            title: documentTitle,
            filepath: document.filepath,
          },
        });
      }

      this.logger.log(`Семантический поиск завершен: найдено ${results.length} результатов`);

      return results;
    } catch (error) {
      this.logger.error('Ошибка семантического поиска', error);
      throw error;
    }
  }

  /**
   * Семантический поиск с формированием контекста для RAG
   */
  async searchWithRAG(
    query: string,
    topK: number = 3,
  ): Promise<{ context: string; results: SearchResult[] }> {
    try {
      const results = await this.semanticSearch(query, { topK });

      if (results.length === 0) {
        return {
          context: '',
          results: [],
        };
      }

      // Формирование контекста из найденных чанков
      const context = results
        .map(
          (r) => `[${r.document.filepath}]\n${r.chunk.content}`,
        )
        .join('\n\n---\n\n');

      this.logger.debug(
        `Контекст для RAG сформирован (чанков: ${results.length}, длина: ${context.length} символов)`,
      );

      return {
        context,
        results,
      };
    } catch (error) {
      this.logger.error('Ошибка поиска с RAG', error);
      throw error;
    }
  }
}

