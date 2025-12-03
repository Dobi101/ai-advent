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
          content: prompt,
        });

      messagesToSend.push(...this.chatHistory);

      this.chatHistory.push({
        role: 'user',
        content: userMessage,
      });

      console.log(messagesToSend);

      const response = await this.client.chat({
        model: 'GigaChat-Pro',
        messages: messagesToSend,
        temperature: 0.5,
        top_p: 0.9,
        n: 1,
        max_tokens: 200,
        repetition_penalty: 1.2,
        profanity_check: true,
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
}
