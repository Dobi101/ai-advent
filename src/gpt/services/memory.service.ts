import { Injectable, Logger } from '@nestjs/common';
import { MemoryData } from '../interfaces/interfaces';
import { summaryPipelinePrompt } from '../assets/prompt';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private memoryData: MemoryData;

  constructor() {
    this.memoryData = this.getDefaultMemory();
    this.logger.log('Session memory initialized');
  }

  private getDefaultMemory(): MemoryData {
    return {
      chatHistory: [],
      compressionCount: 0,
      totalMessagesBeforeCompression: 0,
      temperature: 1,
      compressionThreshold: 10,
      systemPrompt: summaryPipelinePrompt,
    };
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
  }

  /**
   * Очищает историю чата
   */
  clearHistory(): void {
    this.memoryData.chatHistory = [];
    this.memoryData.compressionCount = 0;
    this.memoryData.totalMessagesBeforeCompression = 0;
    this.logger.log('Chat history cleared');
  }
}
