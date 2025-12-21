import { Injectable, Logger } from '@nestjs/common';
import { Function } from 'gigachat/interfaces';
import { ChatMessage, GptResponse } from './interfaces/interfaces';
import { MemoryService } from './services/memory.service';
import { ChatHistoryService } from './services/chat-history.service';
import { FunctionCallHandlerService } from './services/function-call-handler.service';
import { GigaChatClientService } from './services/gigachat-client.service';
import { McpClientService } from '../mcp/mcp-client.service';

@Injectable()
export class GptService {
  private readonly logger = new Logger(GptService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly chatHistoryService: ChatHistoryService,
    private readonly functionCallHandler: FunctionCallHandlerService,
    private readonly gigachatClient: GigaChatClientService,
    private readonly mcpClient: McpClientService,
  ) {}

  /**
   * Очищает историю чата
   */
  clearHistory(): void {
    this.memoryService.clearHistory();
  }

  /**
   * Устанавливает системный промпт
   */
  setSystemPrompt(newPrompt: string): void {
    const memory = this.memoryService.getMemory();
    const updatedHistory = [...memory.chatHistory];

    if (updatedHistory.length > 0 && updatedHistory[0].role === 'system') {
      updatedHistory[0].content = newPrompt;
    }

    this.memoryService.updateMemory({
      systemPrompt: newPrompt,
      chatHistory: updatedHistory,
    });

    this.logger.log('System prompt updated');
  }

  /**
   * Получает системный промпт
   */
  getSystemPrompt(): string {
    return this.memoryService.getMemory().systemPrompt;
  }

  /**
   * Устанавливает температуру
   */
  setTemperature(temperature: number): void {
    if (temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }
    this.memoryService.updateMemory({ temperature });
    this.logger.log(`Temperature updated to ${temperature}`);
  }

  /**
   * Получает температуру
   */
  getTemperature(): number {
    return this.memoryService.getMemory().temperature;
  }

  /**
   * Устанавливает порог сжатия истории
   */
  setCompressionThreshold(threshold: number): void {
    if (threshold < 2) {
      throw new Error('Compression threshold must be at least 2');
    }
    this.memoryService.updateMemory({ compressionThreshold: threshold });
    this.logger.log(`Compression threshold updated to ${threshold}`);
  }

  /**
   * Получает статистику сжатия
   */
  getCompressionStats() {
    const memory = this.memoryService.getMemory();
    const currentHistoryLength =
      this.chatHistoryService.countUserAssistantPairs(memory.chatHistory);

    return {
      compressionCount: memory.compressionCount,
      compressionThreshold: memory.compressionThreshold,
      totalMessagesBeforeCompression: memory.totalMessagesBeforeCompression,
      averageMessagesPerCompression:
        memory.compressionCount > 0
          ? memory.totalMessagesBeforeCompression / memory.compressionCount
          : 0,
      currentHistoryLength,
    };
  }

  /**
   * Возвращает список всех доступных инструментов (functions) из MCP сервера
   */
  async getAvailableTools(): Promise<Function[]> {
    try {
      // Получаем инструменты из MCP сервера
      const mcpTools = await this.mcpClient.listTools();

      // Преобразуем MCP инструменты в формат GigaChat Function
      return mcpTools.tools.map((tool: any) => {
        const schema = tool.inputSchema;
        const properties: Record<string, any> = {};
        const required: string[] = [];

        if (schema.properties) {
          for (const [key, value] of Object.entries(schema.properties)) {
            const prop = value as any;
            const propertyDef: any = {
              type: prop.type,
              description: prop.description,
            };

            // Если это объект с additionalProperties, добавляем пустой properties
            // чтобы GigaChat API принял схему
            if (prop.type === 'object' && prop.additionalProperties) {
              propertyDef.properties = {};
              propertyDef.additionalProperties = {
                type: prop.additionalProperties.type || 'string',
              };
            }

            properties[key] = propertyDef;
          }
        }

        if (schema.required) {
          required.push(...schema.required);
        }

        return {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: schema.type || 'object',
            properties,
            required,
          },
        };
      });
    } catch (error) {
      this.logger.error('Error getting tools from MCP server', error);
      // Возвращаем пустой массив в случае ошибки
      return [];
    }
  }

  /**
   * Отправляет сообщение и получает ответ от GigaChat
   */
  async sendMessage(userMessage: string): Promise<GptResponse> {
    const startTime = Date.now();
    let historyCompressed = false;

    try {
      const memory = this.memoryService.getMemory();
      let chatHistory = [...memory.chatHistory];

      // Инициализация системного промпта, если история пуста
      if (chatHistory.length === 0) {
        chatHistory.push({
          role: 'system',
          content: memory.systemPrompt,
        });
      }

      // Проверка и сжатие истории при необходимости
      const compressionResult =
        await this.chatHistoryService.compressHistoryIfNeeded(
          chatHistory,
          memory.compressionThreshold,
          memory.systemPrompt,
          memory.temperature,
        );

      if (compressionResult.wasCompressed) {
        chatHistory = compressionResult.compressedHistory;
        historyCompressed = true;

        this.memoryService.updateMemory({
          chatHistory,
          compressionCount: memory.compressionCount + 1,
          totalMessagesBeforeCompression:
            memory.totalMessagesBeforeCompression +
            compressionResult.messagesBeforeCompression,
        });
      }

      // Добавляем пользовательское сообщение
      chatHistory.push({
        role: 'user',
        content: userMessage,
      });

      // Получаем доступные функции
      const functions = await this.getAvailableTools();
      const client = this.gigachatClient.getClient();

      // Цикл для обработки function calls (может быть несколько итераций)
      let finalResponse = null;
      let iterationCount = 0;
      const maxIterations = 5; // Защита от бесконечного цикла

      while (iterationCount < maxIterations) {
        const messagesToSend: ChatMessage[] = [...chatHistory];

        this.logger.log(messagesToSend);

        const response = await client.chat({
          model: 'GigaChat',
          messages: messagesToSend,
          temperature: memory.temperature,
          max_tokens: 2048,
          functions: functions,
        });

        if (!response.choices || response.choices.length === 0) {
          throw new Error('No response from GigaChat');
        }

        const message = response.choices[0]?.message;
        const content = message?.content;
        const functionCall = message?.function_call;

        // Если есть function_call, обрабатываем его
        if (functionCall) {
          this.logger.log(`Function call detected: ${functionCall.name}`);

          // Специальная обработка для write_file: если content неполный, используем контент из сообщения
          const functionArgs = { ...(functionCall.arguments || {}) };
          if (
            functionCall.name === 'write_file' &&
            functionArgs.content &&
            (functionArgs.content.length < 100 ||
              functionArgs.content.includes('# ...') ||
              functionArgs.content.trim() === '}') &&
            content &&
            content.length > functionArgs.content.length
          ) {
            this.logger.log(
              'Detected incomplete content in write_file, using assistant message content',
            );
            functionArgs.content = content;
          }

          // Добавляем сообщение ассистента с function_call в историю
          chatHistory.push({
            role: 'assistant',
            content: content || '',
            function_call: {
              name: functionCall.name,
              arguments: functionArgs,
            },
          });

          // Выполняем функцию
          const functionResult =
            await this.functionCallHandler.handleFunctionCall(
              functionCall.name,
              functionArgs,
            );

          // Добавляем результат функции в историю
          chatHistory.push({
            role: 'function',
            name: functionCall.name,
            content: functionResult,
          });

          iterationCount++;
          continue;
        }

        // Если нет function_call, это финальный ответ
        finalResponse = {
          content: content || '',
          usage: response.usage,
        };

        chatHistory.push({
          role: 'assistant',
          content: content || '',
        });

        break;
      }

      if (!finalResponse) {
        throw new Error('Max iterations reached or no final response received');
      }

      // Сохраняем обновленную историю
      this.memoryService.updateMemory({ chatHistory });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const usage = finalResponse.usage;
      const currentHistoryLength =
        this.chatHistoryService.countUserAssistantPairs(chatHistory);

      this.logger.log(
        `GigaChat response received in ${responseTime}ms, tokens: ${usage?.total_tokens || 'N/A'}, history length: ${currentHistoryLength}, iterations: ${iterationCount + 1}`,
      );

      return {
        response: finalResponse.content,
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
}
