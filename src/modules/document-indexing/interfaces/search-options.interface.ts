/**
 * Опции для семантического поиска
 */
export interface SearchOptions {
  topK?: number; // default 5
  minScore?: number; // default 0.3 (similarity threshold)
  filters?: {
    documentIds?: string[];
    tags?: string[];
  };
}

