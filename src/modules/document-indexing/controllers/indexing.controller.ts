import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { DocumentParserService } from '../services/document-parser.service';
import { ChunkingService } from '../services/chunking.service';
import { EmbeddingService } from '../services/embedding.service';
import { IndexStorageService } from '../services/index-storage.service';
import { SearchService } from '../services/search.service';
import { IndexDocumentDto } from '../dto/index-document.dto';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchResult } from '../dto/search-result.dto';
import { DocumentNotFoundException } from '../exceptions/document-not-found.exception';
import { existsSync } from 'fs';

/**
 * Контроллер для REST API индексации документов
 */
@Controller('api/indexing')
export class IndexingController {
  private readonly logger = new Logger(IndexingController.name);

  constructor(
    private readonly documentParserService: DocumentParserService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly indexStorageService: IndexStorageService,
    private readonly searchService: SearchService,
  ) {}

  /**
   * Индексация документа
   * POST /api/indexing/documents
   */
  @Post('documents')
  @HttpCode(HttpStatus.OK)
  async indexDocument(@Body() dto: IndexDocumentDto) {
    try {
      this.logger.log(`Начало индексации документа: ${dto.filepath}`);

      // Валидация: проверка существования файла
      if (!existsSync(dto.filepath)) {
        throw new DocumentNotFoundException(dto.filepath);
      }

      // Валидация: проверка расширения .md
      if (!dto.filepath.endsWith('.md')) {
        throw new BadRequestException(
          'Файл должен иметь расширение .md',
        );
      }

      // 1. Парсинг markdown
      const parsedDocument =
        await this.documentParserService.parseMarkdown(dto.filepath);

      // 2. Разбивка на чанки
      const chunks = this.chunkingService.createChunks(parsedDocument);

      if (chunks.length === 0) {
        throw new BadRequestException(
          'Не удалось создать чанки из документа',
        );
      }

      // 3. Сохранение документа в БД
      const documentId =
        this.indexStorageService.saveDocument(parsedDocument);

      // 4. Установка documentId для всех чанков
      chunks.forEach((chunk) => {
        chunk.documentId = documentId;
      });

      // 5. Сохранение чанков в БД
      this.indexStorageService.saveChunks(chunks);

      // 6. Генерация эмбеддингов для всех чанков
      const texts = chunks.map((chunk) => chunk.content);
      const embeddings = await this.embeddingService.generateEmbeddingsBatch(
        texts,
      );

      // 7. Сохранение эмбеддингов в БД
      for (let i = 0; i < chunks.length; i++) {
        if (embeddings[i] && embeddings[i].length > 0) {
          this.indexStorageService.saveEmbedding(
            chunks[i].id,
            embeddings[i],
            'nomic-embed-text',
          );
        } else {
          this.logger.warn(
            `Не удалось сгенерировать эмбеддинг для чанка ${chunks[i].id}`,
          );
        }
      }

      this.logger.log(
        `Документ успешно проиндексирован: ${dto.filepath} (ID: ${documentId}, чанков: ${chunks.length})`,
      );

      return {
        documentId,
        chunksCount: chunks.length,
        status: 'success',
      };
    } catch (error) {
      this.logger.error(`Ошибка индексации документа ${dto.filepath}`, error);

      if (error instanceof DocumentNotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Ошибка индексации документа: ${error.message}`,
      );
    }
  }

  /**
   * Получение списка всех документов
   * GET /api/indexing/documents
   */
  @Get('documents')
  async getAllDocuments() {
    try {
      const documents = this.indexStorageService.getAllDocuments();
      return documents;
    } catch (error) {
      this.logger.error('Ошибка получения списка документов', error);
      throw new BadRequestException('Ошибка получения списка документов');
    }
  }

  /**
   * Получение деталей документа по ID
   * GET /api/indexing/documents/:id
   */
  @Get('documents/:id')
  async getDocumentById(@Param('id') id: string) {
    try {
      const document = this.indexStorageService.getDocumentById(id);

      if (!document) {
        throw new DocumentNotFoundException();
      }

      const chunks = this.indexStorageService.getChunksByDocumentId(id);

      return {
        document,
        chunks,
      };
    } catch (error) {
      if (error instanceof DocumentNotFoundException) {
        throw error;
      }
      this.logger.error(`Ошибка получения документа ${id}`, error);
      throw new BadRequestException('Ошибка получения документа');
    }
  }

  /**
   * Удаление документа
   * DELETE /api/indexing/documents/:id
   */
  @Delete('documents/:id')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(@Param('id') id: string) {
    try {
      const document = this.indexStorageService.getDocumentById(id);

      if (!document) {
        throw new DocumentNotFoundException();
      }

      this.indexStorageService.deleteDocument(id);

      return {
        success: true,
      };
    } catch (error) {
      if (error instanceof DocumentNotFoundException) {
        throw error;
      }
      this.logger.error(`Ошибка удаления документа ${id}`, error);
      throw new BadRequestException('Ошибка удаления документа');
    }
  }

  /**
   * Семантический поиск
   * POST /api/indexing/search
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() dto: SearchQueryDto): Promise<SearchResult[]> {
    try {
      const options = {
        topK: dto.topK,
        minScore: dto.minScore,
        filters: dto.filters,
      };

      const results = await this.searchService.semanticSearch(
        dto.query,
        options,
      );

      return results;
    } catch (error) {
      this.logger.error('Ошибка семантического поиска', error);
      throw new BadRequestException('Ошибка выполнения поиска');
    }
  }

  /**
   * Получение статистики индекса
   * GET /api/indexing/stats
   */
  @Get('stats')
  async getStats() {
    try {
      const stats = this.indexStorageService.getStats();

      // Получаем дату последней индексации
      const documents = this.indexStorageService.getAllDocuments();
      const lastIndexedAt =
        documents.length > 0
          ? documents[0].indexedAt
          : null;

      return {
        ...stats,
        lastIndexedAt,
      };
    } catch (error) {
      this.logger.error('Ошибка получения статистики', error);
      throw new BadRequestException('Ошибка получения статистики');
    }
  }
}

