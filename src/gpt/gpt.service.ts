import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import GigaChat from 'gigachat';
import { Agent } from 'node:https';
import { prompt } from './assets/prompt';
import { ChatMessage } from './interfaces/interfaces';

@Injectable()
export class GptService implements OnModuleInit {
  private readonly logger = new Logger(GptService.name);
  private client: GigaChat;
  private chatHistory: ChatMessage[] = [];
  private systemPrompt: string;
  private temperature: number = 0;

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

  async sendMessage(userMessage: string) {
    try {
      const messagesToSend: ChatMessage[] = [];

      if (this.chatHistory.length === 0)
        this.chatHistory.push({
          role: 'system',
          content: this.systemPrompt,
        });

      messagesToSend.push(...this.chatHistory);

      this.chatHistory.push({
        role: 'user',
        content: userMessage,
      });

      this.logger.log(messagesToSend);

      const response = await this.client.chat({
        model: 'GigaChat',
        messages: messagesToSend,
        temperature: this.temperature,
        max_tokens: 1000,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from GigaChat');
      }

      const content = response.choices[0]?.message.content;

      this.chatHistory.push({
        role: 'assistant',
        content: content || '',
      });

      this.logger.log('GigaChat response received');
      return content;
    } catch (error) {
      this.logger.error('Error communicating with GigaChat', error);
      throw new Error('Failed to get response from GigaChat');
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
}
