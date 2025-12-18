import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryData } from '../interfaces/interfaces';
import { summaryPipelinePrompt } from '../assets/prompt';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly memoryFilePath: string;
  private memoryData: MemoryData;

  constructor() {
    this.memoryFilePath = join(process.cwd(), 'memory.json');
    this.memoryData = this.loadMemory();
  }

  /**
   * Загружает данные из файла памяти
   */
  private loadMemory(): MemoryData {
    try {
      if (existsSync(this.memoryFilePath)) {
        const fileContent = readFileSync(this.memoryFilePath, 'utf-8');
        const memoryData: MemoryData = JSON.parse(fileContent);

        this.logger.log(
          `Memory loaded from file. History length: ${memoryData.chatHistory?.length || 0}`,
        );

        return {
          chatHistory: memoryData.chatHistory || [],
          compressionCount: memoryData.compressionCount || 0,
          totalMessagesBeforeCompression:
            memoryData.totalMessagesBeforeCompression || 0,
          temperature: memoryData.temperature ?? 1,
          compressionThreshold: memoryData.compressionThreshold || 10,
          systemPrompt: memoryData.systemPrompt || summaryPipelinePrompt,
        };
      } else {
        this.logger.log('Memory file not found, starting with empty history');
        const defaultMemory: MemoryData = {
          chatHistory: [],
          compressionCount: 0,
          totalMessagesBeforeCompression: 0,
          temperature: 1,
          compressionThreshold: 10,
          systemPrompt: summaryPipelinePrompt,
        };
        this.saveMemory(defaultMemory);
        return defaultMemory;
      }
    } catch (error) {
      this.logger.error('Error loading memory from file', error);
      this.logger.log('Starting with empty history');
      return {
        chatHistory: [],
        compressionCount: 0,
        totalMessagesBeforeCompression: 0,
        temperature: 1,
        compressionThreshold: 10,
        systemPrompt: summaryPipelinePrompt,
      };
    }
  }

  /**
   * Сохраняет данные в файл памяти
   */
  saveMemory(memoryData: MemoryData): void {
    try {
      this.memoryData = memoryData;
      writeFileSync(
        this.memoryFilePath,
        JSON.stringify(memoryData, null, 2),
        'utf-8',
      );
      this.logger.debug('Memory saved to file');
    } catch (error) {
      this.logger.error('Error saving memory to file', error);
    }
  }

  /**
   * Получает текущие данные памяти
   */
  getMemory(): MemoryData {
    return { ...this.memoryData };
  }

  /**
   * Обновляет данные памяти
   */
  updateMemory(updates: Partial<MemoryData>): void {
    this.memoryData = { ...this.memoryData, ...updates };
    this.saveMemory(this.memoryData);
  }

  /**
   * Очищает историю чата
   */
  clearHistory(): void {
    this.memoryData.chatHistory = [];
    this.memoryData.compressionCount = 0;
    this.memoryData.totalMessagesBeforeCompression = 0;
    this.saveMemory(this.memoryData);
    this.logger.log('Chat history cleared and memory file updated');
  }
}
