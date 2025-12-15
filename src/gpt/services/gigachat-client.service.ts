import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import GigaChat from 'gigachat';
import { Agent } from 'node:https';

@Injectable()
export class GigaChatClientService implements OnModuleInit {
  private readonly logger = new Logger(GigaChatClientService.name);
  private client: GigaChat;

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

  /**
   * Получает экземпляр клиента GigaChat
   */
  getClient(): GigaChat {
    return this.client;
  }
}
