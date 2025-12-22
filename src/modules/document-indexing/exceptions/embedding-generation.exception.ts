import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Исключение, выбрасываемое при ошибке генерации эмбеддинга
 */
export class EmbeddingGenerationException extends HttpException {
  constructor(message?: string) {
    super(
      message || 'Ошибка генерации эмбеддинга',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

