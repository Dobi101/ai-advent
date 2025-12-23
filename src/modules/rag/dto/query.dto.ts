import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO для запроса RAG
 */
export class QueryDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsBoolean()
  useRAG?: boolean;
}

/**
 * DTO для сравнения RAG
 */
export class CompareQueryDto {
  @IsString()
  question: string;
}

