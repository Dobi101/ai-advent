import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import {
  ParsedDocument,
  Section,
} from '../interfaces/parsed-document.interface';
import { DocumentNotFoundException } from '../exceptions/document-not-found.exception';
import type { Root, Heading, Text } from 'mdast';

/**
 * Сервис для парсинга markdown документов
 */
@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  /**
   * Парсинг markdown файла в структурированный формат
   */
  async parseMarkdown(filepath: string): Promise<ParsedDocument> {
    try {
      // Проверка существования файла
      if (!existsSync(filepath)) {
        throw new DocumentNotFoundException(filepath);
      }

      // Чтение файла
      const fileContent = await readFile(filepath, 'utf-8');

      // Извлечение frontmatter через gray-matter
      const { data: frontmatter, content } = matter(fileContent);

      // Динамический импорт ES модулей
      const { unified } = await import('unified');
      const remarkParse = (await import('remark-parse')).default;

      // Парсинг markdown в AST
      const processor = unified().use(remarkParse);
      const ast = processor.parse(content) as Root;

      // Извлечение секций
      const sections = await this.extractSections(ast, content);

      // Формирование метаданных
      const extractedTitle = await this.extractTitle(ast);
      const metadata = {
        title: frontmatter.title || extractedTitle || filepath,
        tags: frontmatter.tags || [],
        created: frontmatter.created
          ? new Date(frontmatter.created)
          : undefined,
        ...frontmatter,
      };

      this.logger.log(
        `Документ распарсен: ${filepath} (${sections.length} секций)`,
      );

      return {
        metadata,
        sections,
        rawContent: content,
        filepath,
      };
    } catch (error) {
      if (error instanceof DocumentNotFoundException) {
        throw error;
      }
      this.logger.error(`Ошибка парсинга документа ${filepath}`, error);
      throw new Error(`Ошибка парсинга документа: ${error.message}`);
    }
  }

  /**
   * Извлечение секций из AST
   */
  private async extractSections(
    ast: Root,
    content: string,
  ): Promise<Section[]> {
    const sections: Section[] = [];
    let currentPosition = 0;
    let sectionCounter = 0;

    // Стек для отслеживания иерархии секций
    const sectionStack: Section[] = [];

    // Динамический импорт unist-util-visit
    const { visit } = await import('unist-util-visit');

    visit(ast, 'heading', (node: Heading, index: number, parent: any) => {
      const level = node.depth;
      const headingText = this.extractTextFromNode(node);

      // Находим позицию заголовка в исходном тексте
      const headingStart = this.findNodePosition(content, headingText);
      const headingEnd = headingStart + headingText.length;

      // Определяем родительскую секцию
      let parentId: string | undefined;
      while (
        sectionStack.length > 0 &&
        sectionStack[sectionStack.length - 1].level >= level
      ) {
        sectionStack.pop();
      }
      if (sectionStack.length > 0) {
        parentId = sectionStack[sectionStack.length - 1].id;
      }

      // Извлекаем содержимое секции (до следующего заголовка того же или более высокого уровня)
      const sectionContent = this.extractSectionContent(
        ast,
        node,
        level,
        content,
      );

      const section: Section = {
        id: uuidv4(),
        level,
        heading: headingText,
        content: sectionContent,
        parentId,
        position: sectionCounter++,
        charStart: headingStart,
        charEnd: headingStart + sectionContent.length,
      };

      sections.push(section);
      sectionStack.push(section);
    });

    return sections;
  }

  /**
   * Извлечение текста из узла AST
   */
  private extractTextFromNode(node: any): string {
    const texts: string[] = [];

    const collectText = (n: any) => {
      if (n.type === 'text') {
        texts.push((n as Text).value);
      }
      if (n.children) {
        n.children.forEach(collectText);
      }
    };

    collectText(node);
    return texts.join('').trim();
  }

  /**
   * Извлечение содержимого секции
   */
  private extractSectionContent(
    ast: Root,
    headingNode: Heading,
    headingLevel: number,
    content: string,
  ): string {
    const contentParts: string[] = [];

    // Находим индекс заголовка в AST
    let headingIndex = -1;
    ast.children.forEach((child, index) => {
      if (child === headingNode) {
        headingIndex = index;
      }
    });

    if (headingIndex === -1) {
      return '';
    }

    // Собираем все узлы до следующего заголовка того же или более высокого уровня
    for (let i = headingIndex + 1; i < ast.children.length; i++) {
      const node = ast.children[i];

      if (node.type === 'heading') {
        const nextHeading = node as Heading;
        if (nextHeading.depth <= headingLevel) {
          break; // Достигли следующего заголовка того же или более высокого уровня
        }
      }

      // Преобразуем узел обратно в текст
      const nodeText = this.nodeToText(node, content);
      if (nodeText) {
        contentParts.push(nodeText);
      }
    }

    return contentParts.join('\n\n').trim();
  }

  /**
   * Преобразование узла AST в текст
   */
  private nodeToText(node: any, content: string): string {
    if (node.type === 'paragraph') {
      return this.extractTextFromNode(node);
    }
    if (node.type === 'code') {
      return `\`\`\`${node.lang || ''}\n${node.value}\n\`\`\``;
    }
    if (node.type === 'list') {
      return node.children
        .map((item: any) => {
          const itemText = this.extractTextFromNode(item);
          return `- ${itemText}`;
        })
        .join('\n');
    }
    // Для других типов узлов просто извлекаем текст
    return this.extractTextFromNode(node);
  }

  /**
   * Поиск позиции текста в содержимом
   */
  private findNodePosition(content: string, text: string): number {
    const index = content.indexOf(text);
    return index >= 0 ? index : 0;
  }

  /**
   * Извлечение заголовка документа (первый h1 или первый заголовок)
   */
  private async extractTitle(ast: Root): Promise<string | null> {
    let firstHeading: string | null = null;

    // Динамический импорт unist-util-visit
    const { visit } = await import('unist-util-visit');

    visit(ast, 'heading', (node: Heading) => {
      if (!firstHeading && node.depth === 1) {
        firstHeading = this.extractTextFromNode(node);
      }
    });

    return firstHeading;
  }
}
