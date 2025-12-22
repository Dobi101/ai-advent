import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IndexingController } from './controllers/indexing.controller';
import { DocumentParserService } from './services/document-parser.service';
import { ChunkingService } from './services/chunking.service';
import { EmbeddingService } from './services/embedding.service';
import { IndexStorageService } from './services/index-storage.service';
import { SearchService } from './services/search.service';
import indexingConfig from './config/indexing.config';

/**
 * Модуль индексации документов
 */
@Module({
  imports: [ConfigModule.forFeature(indexingConfig)],
  controllers: [IndexingController],
  providers: [
    DocumentParserService,
    ChunkingService,
    EmbeddingService,
    IndexStorageService,
    SearchService,
  ],
  exports: [SearchService], // Экспортируем для использования в других модулях
})
export class DocumentIndexingModule {}

