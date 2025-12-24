import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from '../document-indexing/services/search.service';
import { OllamaService } from './services/ollama.service';
import { RerankerService } from './services/reranker.service';
import {
  FilteredRAGResponse,
  RerankingRAGResponse,
  ThresholdComparisonResult,
  MethodComparisonResult,
} from './types';

/**
 * Интерфейс ответа с RAG
 */
export interface RAGResponse {
  answer: string;
  sources?: string[];
  context?: string;
  usedContext: boolean;
}

/**
 * Интерфейс результата сравнения
 */
export interface CompareResult {
  question: string;
  withRAG: RAGResponse;
  withoutRAG: RAGResponse;
  timestamp: string;
}

/**
 * Сервис для работы с RAG (Retrieval-Augmented Generation)
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly ollamaService: OllamaService,
    private readonly rerankerService: RerankerService,
  ) {}

  /**
   * Промпт для RAG с контекстом
   */
  private buildRAGPrompt(context: string, question: string): string {
    return `Используя следующий контекст, ответь на вопрос.
Если информации в контексте недостаточно, так и скажи.

КОНТЕКСТ:
${context}

ВОПРОС: ${question}

ОТВЕТ:`;
  }

  /**
   * Запрос с использованием RAG
   */
  async queryWithRAG(question: string, topK: number = 3): Promise<RAGResponse> {
    const startTime = Date.now();
    let retrievalTime = 0;
    let llmTime = 0;

    try {
      this.logger.log(`RAG запрос: "${question}"`);

      // 1. Получение релевантных чанков
      const retrievalStart = Date.now();
      const { context, results } = await this.searchService.searchWithRAG(
        question,
        topK,
      );
      retrievalTime = Date.now() - retrievalStart;

      this.logger.debug(
        `Найдено ${results.length} релевантных чанков за ${retrievalTime}ms`,
      );

      // 2. Извлечение источников
      const sources = results.map((r) => r.document.filepath);

      // 3. Формирование промпта
      const prompt = context
        ? this.buildRAGPrompt(context, question)
        : question;

      // 4. Генерация ответа через Ollama
      const llmStart = Date.now();
      const answer = await this.ollamaService.generate(prompt);
      llmTime = Date.now() - llmStart;

      this.logger.log(
        `RAG ответ сгенерирован за ${llmTime}ms (общее время: ${Date.now() - startTime}ms)`,
      );

      return {
        answer,
        sources,
        context,
        usedContext: true,
      };
    } catch (error) {
      this.logger.error('Ошибка RAG запроса', error);
      throw error;
    }
  }

  /**
   * Запрос без использования RAG (прямой запрос к LLM)
   */
  async queryWithoutRAG(question: string): Promise<RAGResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(`Прямой запрос к LLM: "${question}"`);

      const answer = await this.ollamaService.generate(question);
      const llmTime = Date.now() - startTime;

      this.logger.log(`Ответ сгенерирован за ${llmTime}ms`);

      return {
        answer,
        usedContext: false,
      };
    } catch (error) {
      this.logger.error('Ошибка прямого запроса к LLM', error);
      throw error;
    }
  }

  /**
   * Сравнение ответов с RAG и без RAG
   */
  async compare(question: string): Promise<CompareResult> {
    try {
      this.logger.log(`Сравнение режимов для вопроса: "${question}"`);

      // Параллельное выполнение обоих запросов
      const [withRAG, withoutRAG] = await Promise.all([
        this.queryWithRAG(question),
        this.queryWithoutRAG(question),
      ]);

      const result: CompareResult = {
        question,
        withRAG,
        withoutRAG,
        timestamp: new Date().toISOString(),
      };

      this.logger.log('Сравнение завершено');

      return result;
    } catch (error) {
      this.logger.error('Ошибка сравнения режимов', error);
      throw error;
    }
  }

  /**
   * RAG с фильтрацией по порогу схожести
   * @param question - Вопрос пользователя
   * @param threshold - Минимальный порог схожести (0-1)
   */
  async queryWithFilteredRAG(
    question: string,
    threshold: number = 0.7,
  ): Promise<FilteredRAGResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Filtered RAG запрос: "${question}" (threshold: ${threshold})`,
      );

      // Получение отфильтрованных результатов
      const { results, total, filtered } =
        await this.searchService.searchWithThreshold(question, 10, threshold);

      // Если нет релевантных результатов
      if (filtered === 0) {
        this.logger.warn('Не найдено релевантных документов после фильтрации');
        return {
          answer: 'Не нашел релевантной информации в базе знаний.',
          sources: [],
          scores: [],
          usedDocuments: 0,
          totalCandidates: total,
          threshold,
        };
      }

      // Берем топ-3 из отфильтрованных
      const topResults = results.slice(0, 3);
      const sources = topResults.map((r) => r.document.filepath);
      const scores = topResults.map((r) => r.score);

      // Формирование контекста с указанием score
      const context = topResults
        .map(
          (r) =>
            `[${r.document.filepath}] (score: ${r.score.toFixed(2)})\n${r.chunk.content}`,
        )
        .join('\n\n---\n\n');

      // Генерация ответа
      const prompt = this.buildRAGPrompt(context, question);
      const answer = await this.ollamaService.generate(prompt);

      const elapsed = Date.now() - startTime;
      this.logger.log(`Filtered RAG ответ за ${elapsed}ms`);

      return {
        answer,
        sources,
        scores,
        usedDocuments: topResults.length,
        totalCandidates: total,
        threshold,
      };
    } catch (error) {
      this.logger.error('Ошибка Filtered RAG запроса', error);
      throw error;
    }
  }

  /**
   * RAG с переранжированием результатов через LLM
   * @param question - Вопрос пользователя
   * @param initialThreshold - Начальный порог для предварительной фильтрации
   */
  async queryWithReranking(
    question: string,
    initialThreshold: number = 0.6,
  ): Promise<RerankingRAGResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Reranking RAG запрос: "${question}" (initialThreshold: ${initialThreshold})`,
      );

      // 1. Первичный поиск с фильтрацией
      const { results, total, filtered } =
        await this.searchService.searchWithThreshold(
          question,
          10,
          initialThreshold,
        );

      // Если нет результатов после фильтрации
      if (filtered === 0) {
        this.logger.warn('Не найдено результатов для переранжирования');
        return {
          answer: 'Не нашел релевантной информации в базе знаний.',
          sources: [],
          pipeline: {
            totalCandidates: total,
            afterFilter: 0,
            afterRerank: 0,
          },
        };
      }

      // 2. Переранжирование через LLM
      const rerankedResults = await this.rerankerService.rerankResults(
        question,
        results,
        3,
      );

      // 3. Формирование контекста с двумя score
      const context = rerankedResults
        .map(
          (r) =>
            `[${r.document.filepath}] (vector: ${r.score.toFixed(2)}, rerank: ${r.rerankScore.toFixed(2)})\n${r.chunk.content}`,
        )
        .join('\n\n---\n\n');

      // 4. Генерация ответа
      const prompt = this.buildRAGPrompt(context, question);
      const answer = await this.ollamaService.generate(prompt);

      const elapsed = Date.now() - startTime;
      this.logger.log(`Reranking RAG ответ за ${elapsed}ms`);

      return {
        answer,
        sources: rerankedResults.map((r) => ({
          source: r.document.filepath,
          vectorScore: r.score,
          rerankScore: r.rerankScore,
        })),
        pipeline: {
          totalCandidates: total,
          afterFilter: filtered,
          afterRerank: rerankedResults.length,
        },
      };
    } catch (error) {
      this.logger.error('Ошибка Reranking RAG запроса', error);
      throw error;
    }
  }

  /**
   * Сравнение результатов с разными порогами фильтрации
   * @param question - Вопрос пользователя
   * @param thresholds - Массив порогов для сравнения
   */
  async compareThresholds(
    question: string,
    thresholds: number[] = [0.5, 0.7, 0.8],
  ): Promise<ThresholdComparisonResult> {
    try {
      this.logger.log(
        `Сравнение порогов для: "${question}" (${thresholds.join(', ')})`,
      );

      // Параллельное выполнение запросов с разными порогами
      const resultsPromises = thresholds.map(async (threshold) => {
        const response = await this.queryWithFilteredRAG(question, threshold);
        return {
          threshold,
          answer: response.answer,
          sources: response.sources,
          scores: response.scores,
          usedDocuments: response.usedDocuments,
          totalCandidates: response.totalCandidates,
        };
      });

      const results = await Promise.all(resultsPromises);

      // Поиск лучшего порога
      const recommendation = this.findBestThreshold(results);

      return {
        question,
        results,
        recommendation,
      };
    } catch (error) {
      this.logger.error('Ошибка сравнения порогов', error);
      throw error;
    }
  }

  /**
   * Поиск лучшего порога из результатов сравнения
   * Критерии: usedDocuments >= 2 И средний score > 0.7
   */
  private findBestThreshold(
    results: Array<{
      threshold: number;
      usedDocuments: number;
      scores: number[];
    }>,
  ): { bestThreshold: number; reason: string } {
    for (const result of results) {
      if (result.usedDocuments >= 2 && result.scores.length > 0) {
        const avgScore =
          result.scores.reduce((a, b) => a + b, 0) / result.scores.length;
        if (avgScore > 0.7) {
          return {
            bestThreshold: result.threshold,
            reason: `${result.usedDocuments} документов со средним score ${avgScore.toFixed(2)}`,
          };
        }
      }
    }

    // По умолчанию возвращаем 0.7
    return {
      bestThreshold: 0.7,
      reason: 'Использован порог по умолчанию',
    };
  }

  /**
   * Сравнение трех методов RAG
   * @param question - Вопрос пользователя
   */
  async compareMethods(question: string): Promise<MethodComparisonResult> {
    try {
      this.logger.log(`Сравнение методов RAG для: "${question}"`);

      // Параллельное выполнение трех методов с замером времени
      const [basicResult, filteredResult, rerankedResult] = await Promise.all([
        this.measureTime(() => this.queryWithRAG(question)),
        this.measureTime(() => this.queryWithFilteredRAG(question, 0.7)),
        this.measureTime(() => this.queryWithReranking(question)),
      ]);

      // Формирование анализа
      const analysis = this.generateQualityComparison(
        basicResult.result,
        filteredResult.result,
        rerankedResult.result,
      );

      return {
        question,
        methods: {
          basic: {
            answer: basicResult.result.answer,
            sources: basicResult.result.sources || [],
            time: basicResult.time,
          },
          filtered: {
            answer: filteredResult.result.answer,
            sources: filteredResult.result.sources,
            scores: filteredResult.result.scores,
            usedDocuments: filteredResult.result.usedDocuments,
            time: filteredResult.time,
          },
          reranked: {
            answer: rerankedResult.result.answer,
            sources: rerankedResult.result.sources,
            pipeline: rerankedResult.result.pipeline,
            time: rerankedResult.time,
          },
        },
        analysis,
      };
    } catch (error) {
      this.logger.error('Ошибка сравнения методов', error);
      throw error;
    }
  }

  /**
   * Измерение времени выполнения функции
   */
  private async measureTime<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; time: number }> {
    const start = Date.now();
    const result = await fn();
    const time = Date.now() - start;
    return { result, time };
  }

  /**
   * Генерация текстового сравнения качества методов
   */
  private generateQualityComparison(
    basic: RAGResponse,
    filtered: FilteredRAGResponse,
    reranked: RerankingRAGResponse,
  ): MethodComparisonResult['analysis'] {
    const basicDocs = basic.sources?.length || 0;
    const filteredDocs = filtered.usedDocuments;
    const rerankedDocs = reranked.sources.length;

    let qualityComparison = '';

    if (filteredDocs === 0 && rerankedDocs === 0) {
      qualityComparison =
        'Фильтрация и reranking не нашли релевантных документов. Базовый RAG использовал все доступные документы.';
    } else if (rerankedDocs > 0 && reranked.sources[0]?.rerankScore > 0.8) {
      qualityComparison =
        'Reranking показал высокую уверенность в релевантности (score > 0.8). Рекомендуется использовать этот метод.';
    } else if (
      filtered.scores.length > 0 &&
      filtered.scores[0] > 0.7 &&
      filteredDocs >= 2
    ) {
      qualityComparison =
        'Фильтрация нашла достаточно релевантных документов. Reranking может добавить точности.';
    } else {
      qualityComparison =
        'Рекомендуется проверить качество индексированных документов или уточнить запрос.';
    }

    return {
      documentsUsed: {
        basic: basicDocs,
        filtered: filteredDocs,
        reranked: rerankedDocs,
      },
      qualityComparison,
    };
  }
}

