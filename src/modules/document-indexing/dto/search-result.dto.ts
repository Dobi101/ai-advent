import { Chunk } from '../entities/chunk.entity';

/**
 * Результат семантического поиска
 */
export interface SearchResult {
  chunk: Chunk;
  score: number; // Cosine similarity 0-1
  rank: number; // Позиция в результатах (1, 2, 3...)
  document: {
    id: string;
    title: string;
    filepath: string;
  };
}

