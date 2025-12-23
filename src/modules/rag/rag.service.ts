import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from '../document-indexing/services/search.service';
import { OllamaService } from './services/ollama.service';

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
}

