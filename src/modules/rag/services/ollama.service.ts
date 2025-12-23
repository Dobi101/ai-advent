import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaConnectionException } from '../../document-indexing/exceptions/ollama-connection.exception';

/**
 * Интерфейс ответа от Ollama API для генерации текста
 */
interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

/**
 * Сервис для генерации текста через Ollama
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('indexing.ollama.baseUrl') ||
      'http://localhost:11434';
    this.model =
      this.configService.get<string>('indexing.rag.model') ||
      'qwen2.5:3b';
    // Используем специальный таймаут для RAG (больше, так как контекст может быть большим)
    this.timeout =
      this.configService.get<number>('indexing.rag.timeout') ||
      this.configService.get<number>('indexing.ollama.timeout') ||
      60000; // 60 секунд по умолчанию для RAG
  }

  /**
   * Генерация текста через Ollama API
   */
  async generate(prompt: string): Promise<string> {
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

      this.logger.debug(`Генерация текста через Ollama (модель: ${this.model})`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });

      // Очищаем таймаут сразу после получения response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API вернул статус ${response.status}: ${errorText}`,
        );
      }

      // Читаем body без таймаута, так как ответ уже получен
      const data = (await response.json()) as OllamaGenerateResponse;

      if (!data.response) {
        throw new Error('Некорректный формат ответа от Ollama');
      }

      this.logger.debug('Текст успешно сгенерирован');
      return data.response.trim();
    } catch (error: any) {
      // Очищаем таймаут в случае ошибки
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        throw new Error('Таймаут при генерации текста');
      }
      if (error.message?.includes('fetch failed')) {
        throw new OllamaConnectionException(
          'Не удалось подключиться к Ollama API',
        );
      }
      this.logger.error('Ошибка генерации текста', error);
      throw error;
    }
  }
}

