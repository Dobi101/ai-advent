import { IsString, IsNotEmpty, MinLength, IsOptional, IsNumber, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Фильтры для поиска
 */
export class SearchFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * DTO для запроса семантического поиска
 */
export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Запрос должен содержать минимум 3 символа' })
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchFiltersDto)
  filters?: SearchFiltersDto;
}

