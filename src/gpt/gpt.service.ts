import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import GigaChat from 'gigachat';
import { Agent } from 'node:https';
import { prompt, summaryPrompt } from './assets/prompt';
import { ChatMessage, GptResponse } from './interfaces/interfaces';

@Injectable()
export class GptService implements OnModuleInit {
  private readonly logger = new Logger(GptService.name);
  private client: GigaChat;
  private chatHistory: ChatMessage[] = [];
  private systemPrompt: string;
  private temperature: number = 1;
  private compressionThreshold: number = 10;
  private compressionCount: number = 0;
  private totalMessagesBeforeCompression: number = 0;

  onModuleInit() {
    try {
      const httpsAgent = new Agent({
        rejectUnauthorized: false,
      });
      this.client = new GigaChat({
        timeout: 600,
        model: 'GigaChat',
        credentials: process.env.GIGACHAT_CREDENTIALS,
        httpsAgent: httpsAgent,
      });

      this.systemPrompt = prompt;

      this.logger.log('GigaChat client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize GigaChat client', error);
      throw error;
    }
  }

  clearHistory(): void {
    this.chatHistory = [];
    this.logger.log('Chat history cleared');
  }

  setSystemPrompt(newPrompt: string): void {
    this.systemPrompt = newPrompt;

    if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
      this.chatHistory[0].content = newPrompt;
    }

    this.logger.log('System prompt updated');
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  setTemperature(temperature: number): void {
    if (temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }
    this.temperature = temperature;
    this.logger.log(`Temperature updated to ${temperature}`);
  }

  getTemperature(): number {
    return this.temperature;
  }

  private async createHistorySummary(history: ChatMessage[]): Promise<string> {
    try {
      this.logger.log('Creating history summary...');

      const summaryMessages: ChatMessage[] = [
        {
          role: 'system',
          content: summaryPrompt,
        },
        {
          role: 'user',
          content: `Создай резюме следующего диалога:\n\n${history
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join('\n\n')}`,
        },
      ];

      const response = await this.client.chat({
        model: 'GigaChat',
        messages: summaryMessages,
        temperature: this.temperature,
        max_tokens: 1000,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from GigaChat for summary');
      }

      const summary = response.choices[0]?.message.content || '';
      this.logger.log('History summary created successfully');
      return summary;
    } catch (error) {
      this.logger.error('Error creating history summary', error);
      throw new Error('Failed to create history summary');
    }
  }

  private countUserAssistantPairs(): number {
    return this.chatHistory.filter(
      (msg) => msg.role === 'user' || msg.role === 'assistant',
    ).length;
  }

  async sendMessage(userMessage: string): Promise<GptResponse> {
    const startTime = Date.now();
    let historyCompressed = false;

    try {
      const messagesToSend: ChatMessage[] = [];

      if (this.chatHistory.length === 0) {
        this.chatHistory.push({
          role: 'system',
          content: this.systemPrompt,
        });
      }

      const pairsCount = this.countUserAssistantPairs();

      if (pairsCount >= this.compressionThreshold) {
        this.logger.log(
          `History threshold reached (${pairsCount} pairs), compressing...`,
        );

        const historyToCompress = this.chatHistory.filter(
          (msg) => msg.role !== 'system',
        );

        this.totalMessagesBeforeCompression += historyToCompress.length;

        const summary = await this.createHistorySummary(historyToCompress);

        this.chatHistory = [
          {
            role: 'system',
            content: this.systemPrompt,
          },
          {
            role: 'user',
            content: `Резюме предыдущего разговора: ${summary}`,
          },
        ];

        this.compressionCount++;
        historyCompressed = true;
        this.logger.log(
          `History compressed. Compression count: ${this.compressionCount}`,
        );
      }

      this.chatHistory.push({
        role: 'user',
        content: userMessage,
      });

      messagesToSend.push(...this.chatHistory);

      this.logger.log(messagesToSend);

      const response = await this.client.chat({
        model: 'GigaChat',
        messages: messagesToSend,
        temperature: this.temperature,
        max_tokens: 2048,
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from GigaChat');
      }

      const content = response.choices[0]?.message.content;

      this.chatHistory.push({
        role: 'assistant',
        content: content || '',
      });

      const usage = response.usage;
      const currentHistoryLength = this.countUserAssistantPairs();

      this.logger.log(
        `GigaChat response received in ${responseTime}ms, tokens: ${usage?.total_tokens || 'N/A'}, history length: ${currentHistoryLength}`,
      );

      return {
        response: content || '',
        responseTime,
        tokens: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
        historyCompressed,
        historyLength: currentHistoryLength,
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.logger.error(
        `Error communicating with GigaChat after ${responseTime}ms`,
        error,
      );
      throw new Error('Failed to get response from GigaChat');
    }
  }

  setCompressionThreshold(threshold: number): void {
    if (threshold < 2) {
      throw new Error('Compression threshold must be at least 2');
    }
    this.compressionThreshold = threshold;
    this.logger.log(`Compression threshold updated to ${threshold}`);
  }

  getCompressionStats() {
    return {
      compressionCount: this.compressionCount,
      compressionThreshold: this.compressionThreshold,
      totalMessagesBeforeCompression: this.totalMessagesBeforeCompression,
      averageMessagesPerCompression:
        this.compressionCount > 0
          ? this.totalMessagesBeforeCompression / this.compressionCount
          : 0,
      currentHistoryLength: this.countUserAssistantPairs(),
    };
  }
}
