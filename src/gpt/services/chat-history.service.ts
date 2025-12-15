import { Injectable, Logger } from '@nestjs/common';
import { ChatMessage } from '../interfaces/interfaces';
import { summaryPrompt } from '../assets/prompt';
import { GigaChatClientService } from './gigachat-client.service';

@Injectable()
export class ChatHistoryService {
  private readonly logger = new Logger(ChatHistoryService.name);

  constructor(private readonly gigachatClient: GigaChatClientService) {}

  /**
   * Подсчитывает количество пар user-assistant сообщений
   */
  countUserAssistantPairs(chatHistory: ChatMessage[]): number {
    return chatHistory.filter(
      (msg) => msg.role === 'user' || msg.role === 'assistant',
    ).length;
  }

  /**
   * Создает резюме истории чата
   */
  async createHistorySummary(
    history: ChatMessage[],
    temperature: number,
  ): Promise<string> {
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

      const response = await this.gigachatClient.getClient().chat({
        model: 'GigaChat',
        messages: summaryMessages,
        temperature: temperature,
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

  /**
   * Проверяет, нужно ли сжимать историю, и выполняет сжатие если необходимо
   */
  async compressHistoryIfNeeded(
    chatHistory: ChatMessage[],
    compressionThreshold: number,
    systemPrompt: string,
    temperature: number,
  ): Promise<{
    compressedHistory: ChatMessage[];
    wasCompressed: boolean;
    messagesBeforeCompression: number;
  }> {
    const pairsCount = this.countUserAssistantPairs(chatHistory);

    if (pairsCount < compressionThreshold) {
      return {
        compressedHistory: chatHistory,
        wasCompressed: false,
        messagesBeforeCompression: 0,
      };
    }

    this.logger.log(
      `History threshold reached (${pairsCount} pairs), compressing...`,
    );

    const historyToCompress = chatHistory.filter(
      (msg) => msg.role !== 'system',
    );

    const summary = await this.createHistorySummary(
      historyToCompress,
      temperature,
    );

    const compressedHistory: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Резюме предыдущего разговора: ${summary}`,
      },
    ];

    this.logger.log('History compressed successfully');

    return {
      compressedHistory,
      wasCompressed: true,
      messagesBeforeCompression: historyToCompress.length,
    };
  }
}
