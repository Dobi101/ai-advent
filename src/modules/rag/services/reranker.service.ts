import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchResult, RankedResult } from '../types';

/**
 * Сервис для переранжирования результатов семантического поиска
 * Использует LLM для оценки релевантности каждого документа вопросу
 */
@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('indexing.ollama.baseUrl') ||
      'http://localhost:11434';
    this.model =
      this.configService.get<string>('indexing.rag.model') || 'qwen2.5:3b';
    this.timeout = 5000; // 5 секунд на один запрос оценки
  }

  /**
   * Переранжирование результатов поиска
   * @param query - Вопрос пользователя
   * @param results - Результаты векторного поиска
   * @param topK - Количество результатов после переранжирования
   */
  async rerankResults(
    query: string,
    results: SearchResult[],
    topK: number = 3,
  ): Promise<RankedResult[]> {
    if (results.length === 0) {
      return [];
    }

    this.logger.log(
      `Переранжирование ${results.length} результатов для запроса: "${query}"`,
    );

    const startTime = Date.now();

    // Параллельная оценка релевантности для всех документов
    const rerankPromises = results.map(async (result) => {
      const rerankScore = await this.scoreRelevance(
        query,
        result.chunk.content,
      );
      return {
        ...result,
        rerankScore,
      } as RankedResult;
    });

    const rankedResults = await Promise.all(rerankPromises);

    // Сортировка по rerankScore (по убыванию)
    rankedResults.sort((a, b) => b.rerankScore - a.rerankScore);

    // Взятие топ-K результатов
    const topResults = rankedResults.slice(0, topK);

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `Переранжирование завершено за ${elapsed}ms. Топ scores: [${topResults.map((r) => r.rerankScore.toFixed(2)).join(', ')}]`,
    );

    return topResults;
  }

  /**
   * Оценка релевантности документа для вопроса через LLM
   * @param query - Вопрос пользователя
   * @param document - Текст документа
   * @returns Оценка от 0 до 1
   */
  private async scoreRelevance(
    query: string,
    document: string,
  ): Promise<number> {
    // Ограничиваем длину документа до 500 символов
    const truncatedDocument = document.substring(0, 500);

    const prompt = `Оцени релевантность документа для вопроса по шкале от 0 до 1.
Ответь ТОЛЬКО числом без объяснений.

Вопрос: ${query}

Документ: ${truncatedDocument}

Оценка:`;

    let timeoutId: NodeJS.Timeout | null = null;
    let controller: AbortController | null = null;

    try {
      const url = `${this.baseUrl}/api/generate`;

      controller = new AbortController();
      timeoutId = setTimeout(() => {
        if (controller) {
          controller.abort();
        }
      }, this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0, // Детерминированность для оценки
          },
        }),
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        this.logger.warn(`Ollama вернул статус ${response.status}`);
        return 0.5; // Нейтральный score при ошибке
      }

      const data = (await response.json()) as { response: string };
      const responseText = data.response?.trim() || '';

      // Парсинг числа из ответа
      const score = parseFloat(responseText);

      if (isNaN(score)) {
        this.logger.warn(`Не удалось распарсить score: "${responseText}"`);
        return 0;
      }

      // Ограничение диапазона [0, 1]
      return Math.max(0, Math.min(1, score));
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        this.logger.warn('Таймаут при оценке релевантности');
        return 0.5; // Нейтральный score при таймауте
      }

      this.logger.warn(`Ошибка оценки релевантности: ${error.message}`);
      return 0.5; // Нейтральный score при ошибке
    }
  }
}
