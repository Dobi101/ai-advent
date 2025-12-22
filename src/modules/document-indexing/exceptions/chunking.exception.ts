import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Исключение, выбрасываемое при ошибке разбивки документа на чанки
 */
export class ChunkingException extends HttpException {
  constructor(message?: string) {
    super(
      message || 'Ошибка разбивки документа на чанки',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

