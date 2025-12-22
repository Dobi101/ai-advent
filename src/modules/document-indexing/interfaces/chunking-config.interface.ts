/**
 * Конфигурация разбивки документа на чанки
 */
export interface ChunkingConfig {
  maxChunkSize: number; // 1000 символов
  minChunkSize: number; // 200 символов
  overlap: number; // 200 символов
  preserveHeadings: boolean; // true
  strategy: 'recursive' | 'fixed' | 'section';
}

