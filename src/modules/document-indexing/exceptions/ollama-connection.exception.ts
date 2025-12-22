import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Исключение, выбрасываемое когда Ollama недоступен
 */
export class OllamaConnectionException extends HttpException {
  constructor(message?: string) {
    super(
      message || 'Не удалось подключиться к Ollama API',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

