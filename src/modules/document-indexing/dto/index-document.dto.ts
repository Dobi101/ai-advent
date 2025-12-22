import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO для запроса индексации документа
 */
export class IndexDocumentDto {
  @IsString()
  @IsNotEmpty()
  filepath: string;
}

