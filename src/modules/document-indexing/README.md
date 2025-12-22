# Модуль индексации документов

Модуль для индексации markdown файлов с генерацией эмбеддингов через Ollama и семантическим поиском.

## Предварительные требования

### Установка Ollama

1. **Установка Ollama** (если еще не установлен):
   - Windows: скачать с https://ollama.ai/download
   - Linux: `curl -fsSL https://ollama.ai/install.sh | sh`
   - macOS: `brew install ollama` или скачать с официального сайта

2. **Запуск Ollama**:
   ```bash
   ollama serve
   ```
   Сервис должен быть доступен на `http://localhost:11434`

3. **Установка модели nomic-embed-text**:
   ```bash
   ollama pull nomic-embed-text
   ```

4. **Проверка установки модели**:
   ```bash
   ollama list
   ```
   Должна отображаться модель `nomic-embed-text`

## Конфигурация

Модуль использует переменные окружения для настройки:

```env
# Ollama конфигурация
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=nomic-embed-text
OLLAMA_TIMEOUT=30000

# Хранилище
INDEX_DB_PATH=./data/index.db
```

По умолчанию используются значения из `config/indexing.config.ts`.

## API Endpoints

### Индексация документа

```http
POST /api/indexing/documents
Content-Type: application/json

{
  "filepath": "docker-guide.md"
}
```

**Ответ:**
```json
{
  "documentId": "uuid",
  "chunksCount": 42,
  "status": "success"
}
```

### Получение списка документов

```http
GET /api/indexing/documents
```

**Ответ:**
```json
[
  {
    "id": "uuid",
    "filepath": "docker-guide.md",
    "title": "Полное руководство по Docker",
    "metadata": "{\"tags\":[\"docker\",\"guide\"]}",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "indexedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Получение деталей документа

```http
GET /api/indexing/documents/:id
```

**Ответ:**
```json
{
  "document": {
    "id": "uuid",
    "filepath": "docker-guide.md",
    "title": "Полное руководство по Docker",
    "metadata": "{\"tags\":[\"docker\",\"guide\"]}",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "indexedAt": "2024-01-01T00:00:00.000Z"
  },
  "chunks": [
    {
      "id": "uuid",
      "documentId": "uuid",
      "content": "Содержимое чанка...",
      "metadata": {
        "sectionHeading": "Что такое Docker",
        "position": 0,
        "charStart": 0,
        "charEnd": 500,
        "tokenCount": 125,
        "documentTitle": "Полное руководство по Docker"
      }
    }
  ]
}
```

### Удаление документа

```http
DELETE /api/indexing/documents/:id
```

**Ответ:**
```json
{
  "success": true
}
```

### Семантический поиск

```http
POST /api/indexing/search
Content-Type: application/json

{
  "query": "как запустить контейнер",
  "topK": 5,
  "minScore": 0.3,
  "filters": {
    "documentIds": ["uuid1", "uuid2"],
    "tags": ["docker"]
  }
}
```

**Ответ:**
```json
[
  {
    "chunk": {
      "id": "uuid",
      "documentId": "uuid",
      "content": "Содержимое чанка...",
      "metadata": {
        "sectionHeading": "Как запустить контейнер",
        "position": 5,
        "charStart": 1000,
        "charEnd": 1500,
        "tokenCount": 125,
        "documentTitle": "Полное руководство по Docker"
      }
    },
    "score": 0.85,
    "rank": 1,
    "document": {
      "id": "uuid",
      "title": "Полное руководство по Docker",
      "filepath": "docker-guide.md"
    }
  }
]
```

### Статистика индекса

```http
GET /api/indexing/stats
```

**Ответ:**
```json
{
  "totalDocs": 10,
  "totalChunks": 450,
  "dbSizeKB": 2048,
  "lastIndexedAt": "2024-01-01T00:00:00.000Z"
}
```

## Использование в коде

### Импорт SearchService в другом модуле

```typescript
import { Module } from '@nestjs/common';
import { DocumentIndexingModule } from '../modules/document-indexing/document-indexing.module';
import { SearchService } from '../modules/document-indexing/services/search.service';

@Module({
  imports: [DocumentIndexingModule],
  providers: [MyService],
})
export class MyModule {
  constructor(private readonly searchService: SearchService) {}

  async search(query: string) {
    const results = await this.searchService.semanticSearch(query, {
      topK: 5,
      minScore: 0.3,
    });
    return results;
  }
}
```

## Архитектура

Модуль состоит из следующих компонентов:

- **DocumentParserService** - парсинг markdown файлов в структурированный формат
- **ChunkingService** - разбивка документов на чанки с overlap
- **EmbeddingService** - генерация эмбеддингов через Ollama API
- **IndexStorageService** - работа с SQLite базой данных
- **SearchService** - семантический поиск с использованием cosine similarity

## Стратегии чанкинга

Модуль поддерживает три стратегии разбивки документов:

1. **recursive** (по умолчанию) - рекурсивная разбивка по заголовкам, параграфам, предложениям
2. **section** - разбивка по секциям документа
3. **fixed** - фиксированная разбивка по размеру

## Производительность

- Батч-обработка эмбеддингов (16 текстов за раз)
- Транзакции для атомарности операций
- Индексы в БД для быстрого поиска
- Write-Ahead Logging (WAL) для SQLite

## Обработка ошибок

Модуль использует кастомные исключения:

- `DocumentNotFoundException` (404) - файл не найден
- `OllamaConnectionException` (503) - Ollama недоступен
- `EmbeddingGenerationException` (500) - ошибка генерации эмбеддинга
- `ChunkingException` (500) - ошибка разбивки документа

