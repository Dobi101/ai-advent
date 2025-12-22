/**
 * Секция документа (заголовок и содержимое)
 */
export interface Section {
  id: string; // UUID
  level: number; // 1, 2, 3
  heading: string;
  content: string;
  parentId?: string; // ID родительской секции
  position: number; // Позиция в документе (порядковый номер)
  charStart: number;
  charEnd: number;
}

/**
 * Распарсенный документ
 */
export interface ParsedDocument {
  metadata: {
    title: string;
    tags?: string[];
    created?: Date;
    [key: string]: any; // Остальные поля из frontmatter
  };
  sections: Section[];
  rawContent: string;
  filepath: string;
}

