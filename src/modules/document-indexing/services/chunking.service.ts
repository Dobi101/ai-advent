import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Chunk } from '../entities/chunk.entity';
import { ParsedDocument, Section } from '../interfaces/parsed-document.interface';
import { ChunkingConfig } from '../interfaces/chunking-config.interface';
import { ChunkingException } from '../exceptions/chunking.exception';

/**
 * Сервис для разбивки документа на чанки
 */
@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Создание чанков из документа
   */
  createChunks(
    document: ParsedDocument,
    config?: Partial<ChunkingConfig>,
  ): Chunk[] {
    try {
      const chunkingConfig: ChunkingConfig = {
        maxChunkSize:
          config?.maxChunkSize ||
          this.configService.get<number>('indexing.chunking.maxChunkSize') ||
          1000,
        minChunkSize:
          config?.minChunkSize ||
          this.configService.get<number>('indexing.chunking.minChunkSize') ||
          200,
        overlap:
          config?.overlap ||
          this.configService.get<number>('indexing.chunking.overlap') ||
          200,
        preserveHeadings:
          config?.preserveHeadings !== undefined
            ? config.preserveHeadings
            : this.configService.get<boolean>(
                'indexing.chunking.preserveHeadings',
              ) ?? true,
        strategy:
          config?.strategy ||
          (this.configService.get<'recursive' | 'fixed' | 'section'>(
            'indexing.chunking.strategy',
          ) as 'recursive' | 'fixed' | 'section') ||
          'recursive',
      };

      if (chunkingConfig.strategy === 'recursive') {
        return this.createChunksRecursive(document, chunkingConfig);
      } else if (chunkingConfig.strategy === 'section') {
        return this.createChunksBySection(document, chunkingConfig);
      } else {
        return this.createChunksFixed(document, chunkingConfig);
      }
    } catch (error) {
      this.logger.error('Ошибка создания чанков', error);
      throw new ChunkingException(error.message);
    }
  }

  /**
   * Рекурсивная стратегия разбивки
   */
  private createChunksRecursive(
    document: ParsedDocument,
    config: ChunkingConfig,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkCounter = 0;

    // Группируем секции по уровням
    const sectionsByLevel = this.groupSectionsByLevel(document.sections);

    // Обрабатываем каждую секцию уровня 2 (##)
    for (const section of sectionsByLevel[2] || []) {
      const sectionChunks = this.splitSectionRecursive(
        section,
        document,
        config,
        chunkCounter,
      );
      chunks.push(...sectionChunks);
      chunkCounter += sectionChunks.length;
    }

    // Если нет секций уровня 2, обрабатываем весь документ
    if (chunks.length === 0) {
      const fullContent = document.rawContent;
      const fullChunks = this.splitTextRecursive(
        fullContent,
        document,
        config,
        0,
        'root',
      );
      chunks.push(...fullChunks);
    }

    this.logger.log(`Создано чанков (recursive): ${chunks.length}`);
    return chunks;
  }

  /**
   * Разбивка по секциям
   */
  private createChunksBySection(
    document: ParsedDocument,
    config: ChunkingConfig,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkCounter = 0;

    for (const section of document.sections) {
      if (section.content.length <= config.maxChunkSize) {
        // Секция помещается в один чанк
        const chunk = this.createChunkFromSection(
          section,
          document,
          chunkCounter++,
        );
        chunks.push(chunk);
      } else {
        // Разбиваем секцию на несколько чанков
        const sectionChunks = this.splitTextRecursive(
          section.content,
          document,
          config,
          chunkCounter,
          section.heading,
        );
        chunks.push(...sectionChunks);
        chunkCounter += sectionChunks.length;
      }
    }

    this.logger.log(`Создано чанков (section): ${chunks.length}`);
    return chunks;
  }

  /**
   * Фиксированная стратегия разбивки
   */
  private createChunksFixed(
    document: ParsedDocument,
    config: ChunkingConfig,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const content = document.rawContent;
    let position = 0;
    let chunkCounter = 0;

    while (position < content.length) {
      const chunkEnd = Math.min(
        position + config.maxChunkSize,
        content.length,
      );
      let chunkText = content.substring(position, chunkEnd);

      // Если не конец документа, пытаемся разбить по границе предложения
      if (chunkEnd < content.length) {
        const lastSentenceEnd = Math.max(
          chunkText.lastIndexOf('.'),
          chunkText.lastIndexOf('!'),
          chunkText.lastIndexOf('?'),
        );
        if (lastSentenceEnd > config.minChunkSize) {
          chunkText = chunkText.substring(0, lastSentenceEnd + 1);
        }
      }

      const chunk: Chunk = {
        id: uuidv4(),
        documentId: '', // Будет установлен позже
        content: chunkText.trim(),
        metadata: {
          position: chunkCounter++,
          charStart: position,
          charEnd: position + chunkText.length,
          tokenCount: Math.ceil(chunkText.length / 4),
          documentTitle: document.metadata.title,
        },
      };

      chunks.push(chunk);

      // Перемещаемся с учетом overlap
      position += chunkText.length - config.overlap;
    }

    this.logger.log(`Создано чанков (fixed): ${chunks.length}`);
    return chunks;
  }

  /**
   * Рекурсивная разбивка секции
   */
  private splitSectionRecursive(
    section: Section,
    document: ParsedDocument,
    config: ChunkingConfig,
    startPosition: number,
  ): Chunk[] {
    const chunks: Chunk[] = [];

    if (section.content.length <= config.maxChunkSize) {
      // Секция помещается в один чанк
      const chunk = this.createChunkFromSection(
        section,
        document,
        startPosition,
      );
      chunks.push(chunk);
    } else {
      // Пытаемся разбить по подсекциям (###)
      const subsections = this.getSubsections(section, document);
      if (subsections.length > 0) {
        let chunkPos = startPosition;
        for (const subsection of subsections) {
          const subsectionChunks = this.splitSectionRecursive(
            subsection,
            document,
            config,
            chunkPos,
          );
          chunks.push(...subsectionChunks);
          chunkPos += subsectionChunks.length;
        }
      } else {
        // Разбиваем по параграфам, предложениям или символам
        const textChunks = this.splitTextRecursive(
          section.content,
          document,
          config,
          startPosition,
          section.heading,
        );
        chunks.push(...textChunks);
      }
    }

    return chunks;
  }

  /**
   * Рекурсивная разбивка текста
   */
  private splitTextRecursive(
    text: string,
    document: ParsedDocument,
    config: ChunkingConfig,
    startPosition: number,
    sectionHeading?: string,
  ): Chunk[] {
    const chunks: Chunk[] = [];

    if (text.length <= config.maxChunkSize) {
      // Текст помещается в один чанк
      const chunk: Chunk = {
        id: uuidv4(),
        documentId: '', // Будет установлен позже
        content: config.preserveHeadings && sectionHeading
          ? `## ${sectionHeading}\n\n${text}`
          : text,
        metadata: {
          sectionHeading,
          position: startPosition,
          charStart: 0,
          charEnd: text.length,
          tokenCount: Math.ceil(text.length / 4),
          documentTitle: document.metadata.title,
        },
      };
      chunks.push(chunk);
      return chunks;
    }

    // Пытаемся разбить по параграфам
    const paragraphs = text.split(/\n\n+/);
    if (paragraphs.length > 1) {
      let currentChunk = '';
      let chunkPos = startPosition;
      let charOffset = 0;

      for (const paragraph of paragraphs) {
        if (
          currentChunk.length + paragraph.length + 2 <= config.maxChunkSize
        ) {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        } else {
          if (currentChunk) {
            const chunk = this.createChunkFromText(
              currentChunk,
              document,
              config,
              chunkPos++,
              sectionHeading,
              charOffset,
            );
            chunks.push(chunk);
            charOffset += currentChunk.length;
            // Добавляем overlap
            const overlapText = this.getOverlapText(
              currentChunk,
              config.overlap,
            );
            currentChunk = overlapText + '\n\n' + paragraph;
          } else {
            // Параграф слишком большой, разбиваем по предложениям
            const sentenceChunks = this.splitBySentences(
              paragraph,
              document,
              config,
              chunkPos,
              sectionHeading,
              charOffset,
            );
            chunks.push(...sentenceChunks);
            chunkPos += sentenceChunks.length;
            charOffset += paragraph.length;
          }
        }
      }

      if (currentChunk) {
        const chunk = this.createChunkFromText(
          currentChunk,
          document,
          config,
          chunkPos,
          sectionHeading,
          charOffset,
        );
        chunks.push(chunk);
      }

      return chunks;
    }

    // Разбиваем по предложениям
    return this.splitBySentences(
      text,
      document,
      config,
      startPosition,
      sectionHeading,
      0,
    );
  }

  /**
   * Разбивка по предложениям
   */
  private splitBySentences(
    text: string,
    document: ParsedDocument,
    config: ChunkingConfig,
    startPosition: number,
    sectionHeading?: string,
    charOffset: number = 0,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const sentences = text.split(/([.!?]+\s+)/);
    let currentChunk = '';
    let chunkPos = startPosition;
    let currentCharOffset = charOffset;

    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i] + (sentences[i + 1] || '');

      if (currentChunk.length + sentence.length <= config.maxChunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          const chunk = this.createChunkFromText(
            currentChunk,
            document,
            config,
            chunkPos++,
            sectionHeading,
            currentCharOffset,
          );
          chunks.push(chunk);
          currentCharOffset += currentChunk.length;
          // Добавляем overlap
          const overlapText = this.getOverlapText(
            currentChunk,
            config.overlap,
          );
          currentChunk = overlapText + sentence;
        } else {
          // Предложение слишком большое, разбиваем по символам
          const charChunks = this.splitByChars(
            sentence,
            document,
            config,
            chunkPos,
            sectionHeading,
            currentCharOffset,
          );
          chunks.push(...charChunks);
          chunkPos += charChunks.length;
          currentCharOffset += sentence.length;
        }
      }
    }

    if (currentChunk) {
      const chunk = this.createChunkFromText(
        currentChunk,
        document,
        config,
        chunkPos,
        sectionHeading,
        currentCharOffset,
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Разбивка по символам (крайний случай)
   */
  private splitByChars(
    text: string,
    document: ParsedDocument,
    config: ChunkingConfig,
    startPosition: number,
    sectionHeading?: string,
    charOffset: number = 0,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let position = 0;
    let chunkPos = startPosition;

    while (position < text.length) {
      const chunkSize = Math.min(config.maxChunkSize, text.length - position);
      const chunkText = text.substring(position, position + chunkSize);

      const chunk: Chunk = {
        id: uuidv4(),
        documentId: '', // Будет установлен позже
        content: config.preserveHeadings && sectionHeading
          ? `## ${sectionHeading}\n\n${chunkText}`
          : chunkText,
        metadata: {
          sectionHeading,
          position: chunkPos++,
          charStart: charOffset + position,
          charEnd: charOffset + position + chunkSize,
          tokenCount: Math.ceil(chunkText.length / 4),
          documentTitle: document.metadata.title,
        },
      };

      chunks.push(chunk);
      position += chunkSize - config.overlap;
    }

    return chunks;
  }

  /**
   * Создание чанка из секции
   */
  private createChunkFromSection(
    section: Section,
    document: ParsedDocument,
    position: number,
  ): Chunk {
    const content = section.content.trim();
    return {
      id: uuidv4(),
      documentId: '', // Будет установлен позже
      content,
      metadata: {
        sectionHeading: section.heading,
        position,
        charStart: section.charStart,
        charEnd: section.charEnd,
        tokenCount: Math.ceil(content.length / 4),
        documentTitle: document.metadata.title,
      },
    };
  }

  /**
   * Создание чанка из текста
   */
  private createChunkFromText(
    text: string,
    document: ParsedDocument,
    config: ChunkingConfig,
    position: number,
    sectionHeading?: string,
    charOffset: number = 0,
  ): Chunk {
    const content = config.preserveHeadings && sectionHeading
      ? `## ${sectionHeading}\n\n${text.trim()}`
      : text.trim();

    return {
      id: uuidv4(),
      documentId: '', // Будет установлен позже
      content,
      metadata: {
        sectionHeading,
        position,
        charStart: charOffset,
        charEnd: charOffset + text.length,
        tokenCount: Math.ceil(content.length / 4),
        documentTitle: document.metadata.title,
      },
    };
  }

  /**
   * Получение текста для overlap
   */
  private getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
      return text;
    }
    return text.substring(text.length - overlapSize);
  }

  /**
   * Группировка секций по уровням
   */
  private groupSectionsByLevel(sections: Section[]): Record<number, Section[]> {
    const grouped: Record<number, any[]> = {};
    for (const section of sections) {
      if (!grouped[section.level]) {
        grouped[section.level] = [];
      }
      grouped[section.level].push(section);
    }
    return grouped;
  }

  /**
   * Получение подсекций (секции уровня 3 внутри секции уровня 2)
   */
  private getSubsections(parentSection: Section, document: ParsedDocument): Section[] {
    return document.sections.filter(
      (s) => s.level === 3 && s.parentId === parentSection.id,
    );
  }
}

