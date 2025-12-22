/**
 * Entity для документа в базе данных
 */
export interface Document {
  id: string;
  filepath: string;
  title: string | null;
  metadata: string; // JSON строка
  createdAt: string; // ISO datetime
  indexedAt: string; // ISO datetime
}

