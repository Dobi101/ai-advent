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
import {
  CompareThresholdDto,
  CompareMethodsDto,
  FilteredQueryDto,
  RerankingQueryDto,
} from './dto/compare-threshold.dto';

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

  /**
   * RAG запрос с фильтрацией по порогу схожести
   * POST /rag/query-filtered
   */
  @Post('query-filtered')
  @HttpCode(HttpStatus.OK)
  async queryFiltered(@Body() dto: FilteredQueryDto) {
    try {
      if (!dto.question || dto.question.trim().length === 0) {
        throw new BadRequestException('Вопрос не может быть пустым');
      }

      const threshold = dto.threshold ?? 0.7;
      const result = await this.ragService.queryWithFilteredRAG(
        dto.question.trim(),
        threshold,
      );
      return result;
    } catch (error) {
      this.logger.error('Ошибка Filtered RAG запроса', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Ошибка выполнения запроса: ${error.message}`,
      );
    }
  }

  /**
   * RAG запрос с переранжированием через LLM
   * POST /rag/query-reranked
   */
  @Post('query-reranked')
  @HttpCode(HttpStatus.OK)
  async queryReranked(@Body() dto: RerankingQueryDto) {
    try {
      if (!dto.question || dto.question.trim().length === 0) {
        throw new BadRequestException('Вопрос не может быть пустым');
      }

      const initialThreshold = dto.initialThreshold ?? 0.6;
      const result = await this.ragService.queryWithReranking(
        dto.question.trim(),
        initialThreshold,
      );
      return result;
    } catch (error) {
      this.logger.error('Ошибка Reranking RAG запроса', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Ошибка выполнения запроса: ${error.message}`,
      );
    }
  }

  /**
   * Сравнение результатов с разными порогами фильтрации
   * POST /rag/compare-threshold
   */
  @Post('compare-threshold')
  @HttpCode(HttpStatus.OK)
  async compareThreshold(@Body() dto: CompareThresholdDto) {
    try {
      if (!dto.question || dto.question.trim().length === 0) {
        throw new BadRequestException('Вопрос не может быть пустым');
      }

      const thresholds = dto.thresholds ?? [0.5, 0.7, 0.8];

      // Валидация порогов
      for (const threshold of thresholds) {
        if (threshold < 0 || threshold > 1) {
          throw new BadRequestException(
            `Порог ${threshold} должен быть в диапазоне [0, 1]`,
          );
        }
      }

      const result = await this.ragService.compareThresholds(
        dto.question.trim(),
        thresholds,
      );
      return result;
    } catch (error) {
      this.logger.error('Ошибка сравнения порогов', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Ошибка выполнения сравнения: ${error.message}`,
      );
    }
  }

  /**
   * Сравнение трех методов RAG (базовый, с фильтрацией, с reranking)
   * POST /rag/compare-methods
   */
  @Post('compare-methods')
  @HttpCode(HttpStatus.OK)
  async compareMethods(@Body() dto: CompareMethodsDto) {
    try {
      if (!dto.question || dto.question.trim().length === 0) {
        throw new BadRequestException('Вопрос не может быть пустым');
      }

      const result = await this.ragService.compareMethods(dto.question.trim());
      return result;
    } catch (error) {
      this.logger.error('Ошибка сравнения методов', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Ошибка выполнения сравнения: ${error.message}`,
      );
    }
  }
}

