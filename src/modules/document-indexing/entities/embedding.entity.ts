/**
 * Entity для эмбеддинга в базе данных
 */
export interface Embedding {
  chunkId: string;
  vector: number[]; // Десериализованный вектор
  model: string;
  dimension: number;
}

