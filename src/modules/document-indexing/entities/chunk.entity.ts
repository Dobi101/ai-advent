/**
 * Entity для чанка документа
 */
export interface Chunk {
  id: string; // UUID
  documentId: string;
  content: string;
  metadata: {
    sectionHeading?: string;
    position: number;
    charStart: number;
    charEnd: number;
    tokenCount?: number; // Примерная оценка (content.length / 4)
    documentTitle: string;
  };
}

