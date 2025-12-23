import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { OllamaService } from './services/ollama.service';
import { DocumentIndexingModule } from '../document-indexing/document-indexing.module';

/**
 * Модуль RAG (Retrieval-Augmented Generation)
 */
@Module({
  imports: [
    ConfigModule,
    DocumentIndexingModule, // Для использования SearchService
  ],
  controllers: [RagController],
  providers: [RagService, OllamaService],
  exports: [RagService],
})
export class RagModule {}

