import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Исключение, выбрасываемое когда документ не найден
 */
export class DocumentNotFoundException extends HttpException {
  constructor(filepath?: string) {
    const message = filepath
      ? `Документ не найден: ${filepath}`
      : 'Документ не найден';
    super(message, HttpStatus.NOT_FOUND);
  }
}

