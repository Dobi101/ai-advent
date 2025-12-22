import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { statSync } from 'fs';
import { mkdirSync } from 'fs';
import { Document } from '../entities/document.entity';
import { Chunk } from '../entities/chunk.entity';
import { ParsedDocument } from '../interfaces/parsed-document.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Сервис для работы с SQLite базой данных
 */
@Injectable()
export class IndexStorageService implements OnModuleInit {
  private readonly logger = new Logger(IndexStorageService.name);
  private db: Database.Database;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Инициализация базы данных при старте модуля
   */
  onModuleInit() {
    this.initDatabase();
  }

  /**
   * Инициализация базы данных
   */
  initDatabase(): void {
    try {
      const dbPath = this.configService.get<string>('indexing.storage.dbPath');
      if (!dbPath) {
        throw new Error('Путь к базе данных не указан в конфигурации');
      }

      // Создать директорию если не существует
      const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
      if (dbDir) {
        try {
          mkdirSync(dbDir, { recursive: true });
        } catch (error) {
          // Директория уже существует, игнорируем ошибку
        }
      }

      // Подключение к базе данных
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging для лучшей производительности

      // Выполнение миграций
      this.runMigrations();

      this.logger.log(`База данных инициализирована: ${dbPath}`);
    } catch (error) {
      this.logger.error('Ошибка инициализации базы данных', error);
      throw error;
    }
  }

  /**
   * Выполнение миграций
   */
  private runMigrations(): void {
    try {
      // SQL схема встроена в код для избежания проблем с путями
      const migrationSQL = `
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
`;

      // Выполняем миграцию
      this.db.exec(migrationSQL);

      this.logger.log('Миграции выполнены успешно');
    } catch (error) {
      this.logger.error('Ошибка выполнения миграций', error);
      throw error;
    }
  }

  /**
   * Сохранение документа в базу данных
   */
  saveDocument(doc: ParsedDocument): string {
    try {
      const documentId = uuidv4();
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        INSERT INTO documents (id, filepath, title, metadata, created_at, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        documentId,
        doc.filepath,
        doc.metadata.title || null,
        JSON.stringify(doc.metadata),
        doc.metadata.created?.toISOString() || now,
        now,
      );

      this.logger.log(`Документ сохранен: ${doc.filepath} (ID: ${documentId})`);
      return documentId;
    } catch (error) {
      this.logger.error('Ошибка сохранения документа', error);
      throw error;
    }
  }

  /**
   * Сохранение чанков в базу данных (batch операция)
   */
  saveChunks(chunks: Chunk[]): void {
    if (chunks.length === 0) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO chunks (id, document_id, content, position, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((chunks: Chunk[]) => {
        for (const chunk of chunks) {
          stmt.run(
            chunk.id,
            chunk.documentId,
            chunk.content,
            chunk.metadata.position,
            JSON.stringify(chunk.metadata),
          );
        }
      });

      transaction(chunks);

      this.logger.log(`Сохранено чанков: ${chunks.length}`);
    } catch (error) {
      this.logger.error('Ошибка сохранения чанков', error);
      throw error;
    }
  }

  /**
   * Сохранение эмбеддинга в базу данных
   */
  saveEmbedding(chunkId: string, vector: number[], model: string): void {
    try {
      // Сериализация вектора в Float32Array и затем в Buffer
      const float32Array = new Float32Array(vector);
      const buffer = Buffer.from(float32Array.buffer);

      const stmt = this.db.prepare(`
        INSERT INTO embeddings (chunk_id, vector, model, dimension)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(chunkId, buffer, model, vector.length);

      this.logger.debug(`Эмбеддинг сохранен для чанка: ${chunkId}`);
    } catch (error) {
      this.logger.error('Ошибка сохранения эмбеддинга', error);
      throw error;
    }
  }

  /**
   * Получение всех эмбеддингов с чанками для семантического поиска
   */
  getAllEmbeddings(): Array<{
    chunkId: string;
    vector: number[];
    chunk: Chunk;
  }> {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          e.chunk_id,
          e.vector,
          e.model,
          e.dimension,
          c.id as chunk_id_full,
          c.document_id,
          c.content,
          c.position,
          c.metadata as chunk_metadata,
          d.title as document_title
        FROM embeddings e
        JOIN chunks c ON e.chunk_id = c.id
        JOIN documents d ON c.document_id = d.id
      `);

      const rows = stmt.all() as Array<{
        chunk_id: string;
        vector: Buffer;
        model: string;
        dimension: number;
        chunk_id_full: string;
        document_id: string;
        content: string;
        position: number;
        chunk_metadata: string;
        document_title: string;
      }>;

      return rows.map((row) => {
        // Десериализация вектора из Buffer
        const float32Array = new Float32Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
        );
        const vector = Array.from(float32Array);

        const chunkMetadata = JSON.parse(row.chunk_metadata);

        return {
          chunkId: row.chunk_id,
          vector,
          chunk: {
            id: row.chunk_id_full,
            documentId: row.document_id,
            content: row.content,
            metadata: {
              ...chunkMetadata,
              documentTitle: row.document_title,
            },
          },
        };
      });
    } catch (error) {
      this.logger.error('Ошибка получения эмбеддингов', error);
      throw error;
    }
  }

  /**
   * Получение документа по ID
   */
  getDocumentById(id: string): Document | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
      const row = stmt.get(id) as
        | {
            id: string;
            filepath: string;
            title: string | null;
            metadata: string;
            created_at: string;
            indexed_at: string;
          }
        | undefined;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        filepath: row.filepath,
        title: row.title,
        metadata: row.metadata,
        createdAt: row.created_at,
        indexedAt: row.indexed_at,
      };
    } catch (error) {
      this.logger.error('Ошибка получения документа', error);
      throw error;
    }
  }

  /**
   * Получение всех документов
   */
  getAllDocuments(): Document[] {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM documents ORDER BY indexed_at DESC',
      );
      const rows = stmt.all() as Array<{
        id: string;
        filepath: string;
        title: string | null;
        metadata: string;
        created_at: string;
        indexed_at: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        filepath: row.filepath,
        title: row.title,
        metadata: row.metadata,
        createdAt: row.created_at,
        indexedAt: row.indexed_at,
      }));
    } catch (error) {
      this.logger.error('Ошибка получения документов', error);
      throw error;
    }
  }

  /**
   * Получение чанков по ID документа
   */
  getChunksByDocumentId(docId: string): Chunk[] {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM chunks WHERE document_id = ? ORDER BY position ASC',
      );
      const rows = stmt.all(docId) as Array<{
        id: string;
        document_id: string;
        content: string;
        position: number;
        metadata: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        content: row.content,
        metadata: JSON.parse(row.metadata),
      }));
    } catch (error) {
      this.logger.error('Ошибка получения чанков', error);
      throw error;
    }
  }

  /**
   * Удаление документа и всех связанных данных (CASCADE)
   */
  deleteDocument(id: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
      const result = stmt.run(id);

      if (result.changes === 0) {
        throw new Error(`Документ с ID ${id} не найден`);
      }

      this.logger.log(`Документ удален: ${id}`);
    } catch (error) {
      this.logger.error('Ошибка удаления документа', error);
      throw error;
    }
  }

  /**
   * Получение статистики индекса
   */
  getStats(): {
    totalDocs: number;
    totalChunks: number;
    dbSizeKB: number;
  } {
    try {
      const docsStmt = this.db.prepare(
        'SELECT COUNT(*) as count FROM documents',
      );
      const chunksStmt = this.db.prepare(
        'SELECT COUNT(*) as count FROM chunks',
      );

      const docsResult = docsStmt.get() as { count: number };
      const chunksResult = chunksStmt.get() as { count: number };

      // Получение размера БД
      const dbPath = this.configService.get<string>('indexing.storage.dbPath');
      let dbSizeKB = 0;
      if (dbPath) {
        try {
          const stats = statSync(dbPath);
          dbSizeKB = Math.round(stats.size / 1024);
        } catch (error) {
          this.logger.warn('Не удалось получить размер БД', error);
        }
      }

      return {
        totalDocs: docsResult.count,
        totalChunks: chunksResult.count,
        dbSizeKB,
      };
    } catch (error) {
      this.logger.error('Ошибка получения статистики', error);
      throw error;
    }
  }

  /**
   * Закрытие соединения с БД
   */
  onModuleDestroy() {
    if (this.db) {
      this.db.close();
      this.logger.log('Соединение с базой данных закрыто');
    }
  }
}
