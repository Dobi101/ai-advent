-- Схема базы данных для индексации документов

-- Таблица документов
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filepath TEXT NOT NULL UNIQUE,
  title TEXT,
  metadata TEXT,  -- JSON
  created_at TEXT NOT NULL,  -- ISO datetime
  indexed_at TEXT NOT NULL
);

-- Таблица чанков
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  position INTEGER NOT NULL,
  metadata TEXT,  -- JSON
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Таблица эмбеддингов
CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id TEXT PRIMARY KEY,
  vector BLOB NOT NULL,        -- Float32Array сериализовано
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- Индексы для оптимизации поиска
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_position ON chunks(document_id, position);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);

