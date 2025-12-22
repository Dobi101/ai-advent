import { registerAs } from '@nestjs/config';

/**
 * Конфигурация модуля индексации документов
 */
export default registerAs('indexing', () => ({
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'nomic-embed-text',
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10),
    maxRetries: 3,
    batchSize: 16,
  },
  chunking: {
    maxChunkSize: 1000,
    minChunkSize: 200,
    overlap: 200,
    strategy: 'recursive' as const,
    preserveHeadings: true,
  },
  storage: {
    dbPath: process.env.INDEX_DB_PATH || './data/index.db',
  },
  search: {
    defaultTopK: 5,
    minScore: 0.3,
  },
}));

