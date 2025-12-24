import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO для сравнения порогов фильтрации
 */
export class CompareThresholdDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsNumber({}, { each: true })
  @Type(() => Number)
  thresholds?: number[];
}

/**
 * DTO для сравнения методов RAG
 */
export class CompareMethodsDto {
  @IsString()
  question: string;
}

/**
 * DTO для RAG запроса с фильтрацией
 */
export class FilteredQueryDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  threshold?: number;
}

/**
 * DTO для RAG запроса с переранжированием
 */
export class RerankingQueryDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  initialThreshold?: number;
}
