import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Function as GigaChatFunction } from 'gigachat/interfaces';

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private toolsCache: GigaChatFunction[] | null = null;
  private readonly serverUrl: string;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.serverUrl = this.configService.get<string>(
      'MCP_SERVER_URL',
      'http://localhost:3000/mcp',
    );
  }

  async onModuleInit() {
    try {
      this.logger.log(`Connecting to MCP server at ${this.serverUrl}`);
      const url = new URL(this.serverUrl);
      this.transport = new StreamableHTTPClientTransport(url);
      this.client = new Client(
        { name: 'gpt-backend-client', version: '1.0.0' },
        {
          capabilities: {},
        },
      );
      await this.client.connect(this.transport);
      this.isConnected = true;
      this.logger.log('Successfully connected to MCP server');
    } catch (error) {
      this.logger.error(
        `Failed to connect to MCP server at ${this.serverUrl}. MCP tools will not be available.`,
        error,
      );
      // Graceful degradation - не падаем, если MCP сервер недоступен
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.close();
        this.logger.log('MCP client connection closed');
      } catch (error) {
        this.logger.error('Error closing MCP client connection', error);
      }
    }
  }

  /**
   * Возвращает список всех доступных инструментов (functions) из MCP сервера
   */
  async getAvailableTools(): Promise<GigaChatFunction[]> {
    if (!this.isConnected || !this.client) {
      this.logger.warn(
        'MCP client is not connected, returning empty tools list',
      );
      return [];
    }

    // Возвращаем кэш, если он есть
    if (this.toolsCache) {
      return this.toolsCache;
    }

    try {
      const tools = await this.client.listTools();
      this.toolsCache = tools.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema,
      }));
      this.logger.log(`Loaded ${this.toolsCache.length} tools from MCP server`);
      return this.toolsCache;
    } catch (error) {
      this.logger.error('Error fetching tools from MCP server', error);
      return [];
    }
  }

  /**
   * Вызывает tool на MCP сервере
   * Всегда возвращает валидный JSON-строку для GigaChat
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.isConnected || !this.client) {
      this.logger.warn(
        `MCP client is not connected, cannot call tool: ${name}`,
      );
      return JSON.stringify({
        error: true,
        message: 'MCP client is not connected',
      });
    }

    try {
      this.logger.log(
        `Calling MCP tool: ${name} with args: ${JSON.stringify(args)}`,
      );
      const result = await this.client.callTool({ name, arguments: args });

      // Преобразование результата в валидный JSON
      if (
        result.content &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const textContent = result.content.find(
          (c: { type?: string; text?: string }) => c.type === 'text',
        );
        if (textContent && 'text' in textContent && textContent.text) {
          const text: string = textContent.text;
          // Проверяем, является ли текст валидным JSON
          try {
            const parsed = JSON.parse(text);
            // Если это уже объект/массив, возвращаем как JSON
            return JSON.stringify(parsed);
          } catch {
            // Если не JSON, оборачиваем в объект с полем result
            return JSON.stringify({ result: text });
          }
        }
        // Если нет текстового контента, возвращаем JSON
        return JSON.stringify(result.content, null, 2);
      }

      return JSON.stringify(result, null, 2);
    } catch (error) {
      this.logger.error(`Error calling MCP tool ${name}`, error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return JSON.stringify({
        error: true,
        message: `Failed to call MCP tool: ${errorMessage}`,
      });
    }
  }

  /**
   * Проверяет, является ли функция MCP tool
   */
  async isMcpTool(functionName: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const tools = await this.getAvailableTools();
      return tools.some((tool) => tool.name === functionName);
    } catch (error) {
      this.logger.error('Error checking if function is MCP tool', error);
      return false;
    }
  }
}
