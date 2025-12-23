import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { RagService } from './rag.service';
import { QueryDto, CompareQueryDto } from './dto/query.dto';

/**
 * Контроллер для RAG API
 */
@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(private readonly ragService: RagService) {}

  /**
   * Сравнение ответов с RAG и без RAG
   * POST /rag/compare
   */
  @Post('compare')
  @HttpCode(HttpStatus.OK)
  async compare(@Body() dto: CompareQueryDto) {
    try {
      if (!dto.question || dto.question.trim().length === 0) {
        throw new BadRequestException('Вопрос не может быть пустым');
      }

      const result = await this.ragService.compare(dto.question.trim());
      return result;
    } catch (error) {
      this.logger.error('Ошибка сравнения режимов', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Ошибка выполнения сравнения: ${error.message}`,
      );
    }
  }

  /**
   * Запрос с опциональным использованием RAG
   * POST /rag/query
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  async query(@Body() dto: QueryDto) {
    try {
      if (!dto.question || dto.question.trim().length === 0) {
        throw new BadRequestException('Вопрос не может быть пустым');
      }

      const useRAG = dto.useRAG !== undefined ? dto.useRAG : true;

      if (useRAG) {
        const result = await this.ragService.queryWithRAG(dto.question.trim());
        return result;
      } else {
        const result = await this.ragService.queryWithoutRAG(
          dto.question.trim(),
        );
        return result;
      }
    } catch (error) {
      this.logger.error('Ошибка RAG запроса', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Ошибка выполнения запроса: ${error.message}`,
      );
    }
  }
}

