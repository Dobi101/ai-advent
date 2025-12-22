import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaConnectionException } from '../exceptions/ollama-connection.exception';
import { EmbeddingGenerationException } from '../exceptions/embedding-generation.exception';

/**
 * Интерфейс ответа от Ollama API для эмбеддингов
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Интерфейс ответа от Ollama API для списка моделей
 */
interface OllamaModelsResponse {
  models: Array<{ name: string }>;
}

/**
 * Сервис для генерации эмбеддингов через Ollama
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly batchSize: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('indexing.ollama.baseUrl') ||
      'http://localhost:11434';
    this.model =
      this.configService.get<string>('indexing.ollama.model') ||
      'nomic-embed-text';
    this.timeout =
      this.configService.get<number>('indexing.ollama.timeout') || 30000;
    this.maxRetries =
      this.configService.get<number>('indexing.ollama.maxRetries') || 3;
    this.batchSize =
      this.configService.get<number>('indexing.ollama.batchSize') || 16;
  }

  /**
   * Генерация эмбеддинга для одного текста
   */
  async generateEmbedding(text: string): Promise<number[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeEmbeddingRequest(text);

        if (!response.embedding || !Array.isArray(response.embedding)) {
          throw new Error('Некорректный формат ответа от Ollama');
        }

        this.logger.debug(
          `Эмбеддинг сгенерирован (размерность: ${response.embedding.length})`,
        );
        return response.embedding;
      } catch (error) {
        lastError = error;
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff

        if (attempt < this.maxRetries) {
          this.logger.warn(
            `Попытка ${attempt}/${this.maxRetries} не удалась, повтор через ${delay}ms`,
            error.message,
          );
          await this.sleep(delay);
        } else {
          this.logger.error(
            `Все попытки генерации эмбеддинга исчерпаны`,
            error,
          );
        }
      }
    }

    throw new EmbeddingGenerationException(
      lastError?.message || 'Не удалось сгенерировать эмбеддинг',
    );
  }

  /**
   * Генерация эмбеддингов для батча текстов
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];
    const totalBatches = Math.ceil(texts.length / this.batchSize);

    this.logger.log(
      `Начало генерации эмбеддингов для ${texts.length} текстов (${totalBatches} батчей)`,
    );

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;

      this.logger.log(
        `Обработка батча ${batchNumber}/${totalBatches} (${batch.length} текстов)`,
      );

      const batchPromises = batch.map((text, index) =>
        this.generateEmbedding(text).catch((error) => {
          this.logger.error(
            `Ошибка генерации эмбеддинга для текста ${i + index + 1}`,
            error,
          );
          return null; // Возвращаем null для failed эмбеддингов
        }),
      );

      const batchResults = await Promise.all(batchPromises);

      // Фильтруем null значения и добавляем в результаты
      for (const result of batchResults) {
        if (result !== null) {
          results.push(result);
        } else {
          // Добавляем пустой вектор для failed эмбеддингов
          // Это нужно для сохранения порядка
          results.push([]);
        }
      }
    }

    const successCount = results.filter((r) => r.length > 0).length;
    this.logger.log(
      `Генерация эмбеддингов завершена: ${successCount}/${texts.length} успешно`,
    );

    return results;
  }

  /**
   * Проверка доступности Ollama и наличия модели
   */
  async checkOllamaHealth(): Promise<boolean> {
    try {
      // Проверка доступности API
      const tagsUrl = `${this.baseUrl}/api/tags`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд для health check

      try {
        const response = await fetch(tagsUrl, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama API вернул статус ${response.status}`);
        }

        const data = (await response.json()) as OllamaModelsResponse;

        // Проверка наличия модели
        const modelExists = data.models?.some(
          (m) => m.name === this.model || m.name.includes(this.model),
        );

        if (!modelExists) {
          this.logger.warn(
            `Модель ${this.model} не найдена в списке доступных моделей`,
          );
          return false;
        }

        this.logger.log(`Ollama доступен, модель ${this.model} найдена`);
        return true;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Таймаут при проверке Ollama');
        }
        throw fetchError;
      }
    } catch (error) {
      this.logger.error('Ошибка проверки здоровья Ollama', error);
      throw new OllamaConnectionException(
        `Не удалось подключиться к Ollama: ${error.message}`,
      );
    }
  }

  /**
   * Выполнение HTTP запроса к Ollama API для генерации эмбеддинга
   */
  private async makeEmbeddingRequest(text: string): Promise<OllamaEmbeddingResponse> {
    const url = `${this.baseUrl}/api/embeddings`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API вернул статус ${response.status}: ${errorText}`,
        );
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      return data;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Таймаут при генерации эмбеддинга');
      }
      if (fetchError.message.includes('fetch failed')) {
        throw new OllamaConnectionException(
          'Не удалось подключиться к Ollama API',
        );
      }
      throw fetchError;
    }
  }

  /**
   * Задержка выполнения
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

