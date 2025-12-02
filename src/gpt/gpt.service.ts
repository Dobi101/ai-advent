import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import GigaChat from 'gigachat';
import { Agent } from 'node:https';

@Injectable()
export class GptService implements OnModuleInit {
  private readonly logger = new Logger(GptService.name);
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

  async sendMessage(userMessage: string) {
    try {
      const response = await this.client.chat({
        model: 'GigaChat',
        messages: [
          {
            role: 'system',
            content: `«Твоя задача — преобразовать данные о [ОПИСАНИЕ ДАННЫХ] в формат XML.

Следуй строго этой схеме:
    
<data>
  <item>
    <id>Уникальный ID</id>
    <title>Заголовок</title>
    <description>Описание</description>
    <attributes>
       <attr name="ключ">значение</attr>
    </attributes>
  </item>
</data>

  

Важные правила:

    Вывод должен быть валидным XML.

    В ответе должен быть только XML-код, без дополнительных символов или оберток.

    Не используй Markdown-разметку (т.е. не оборачивай ответ в xml ... ).

    Если в тексте встречаются спецсимволы (<, >, &), обязательно экранируй их или используй CDATA.»`,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from GigaChat');
      }

      const content = response.choices[0]?.message.content;
      this.logger.log('GigaChat response received');
      return content;
    } catch (error) {
      this.logger.error('Error communicating with GigaChat', error);
      throw new Error('Failed to get response from GigaChat');
    }
  }
}
