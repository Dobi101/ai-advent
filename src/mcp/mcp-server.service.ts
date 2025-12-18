import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FetchResult, WriteFileResult } from './interfaces/mcp.interfaces';

@Injectable()
export class McpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpServerService.name);
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private readonly documentsDir: string;
  private isRunning = false;
  private listToolsHandler?: (request: any) => Promise<any>;
  private callToolHandler?: (request: any) => Promise<any>;

  constructor(private readonly configService: ConfigService) {
    this.documentsDir =
      this.configService.get<string>('MCP_DOCUMENTS_DIR') ||
      path.join(process.cwd(), 'src', 'mcp', 'documents');

    // Создаем MCP сервер
    this.server = new Server(
      {
        name: 'advent-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupTools();
  }

  async onModuleInit() {
    // MCP сервер обычно работает через stdio, но для интеграции с NestJS
    // мы будем использовать его в режиме in-process
    // Транспорт будет инициализирован только если нужно
    this.logger.log('MCP Server initialized');
  }

  async onModuleDestroy() {
    if (this.transport) {
      await this.transport.close();
    }
    this.logger.log('MCP Server destroyed');
  }

  private setupTools() {
    // Регистрируем обработчик для списка инструментов
    this.listToolsHandler = async () => {
      return {
        tools: [
          {
            name: 'fetch',
            description:
              'Загружает содержимое веб-страницы или ресурса по URL. Возвращает текст, HTML или JSON контент.',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'URL ресурса для загрузки',
                },
                headers: {
                  type: 'object',
                  description: 'Опциональные HTTP заголовки',
                  additionalProperties: {
                    type: 'string',
                  },
                },
              },
              required: ['url'],
            },
          },
          {
            name: 'write_file',
            description:
              'Сохраняет markdown документ в файловую систему. Файл будет сохранен в директории documents.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description:
                    'Путь к файлу (относительный путь будет сохранен в documents/, абсолютный путь используется как есть)',
                },
                content: {
                  type: 'string',
                  description: 'Содержимое файла в формате markdown',
                },
              },
              required: ['file_path', 'content'],
            },
          },
        ],
      };
    };
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      this.listToolsHandler,
    );

    // Регистрируем обработчик для вызова инструментов
    this.callToolHandler = async (request: any) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'fetch': {
            const url = args?.url as string;
            if (!url || typeof url !== 'string') {
              throw new Error('URL is required and must be a string');
            }
            const headers = (args?.headers as Record<string, string>) || {};
            const result = await this.fetch(url, headers);
            return {
              content: [
                {
                  type: 'text',
                  text: result,
                },
              ],
            };
          }

          case 'write_file': {
            const filePath = args?.file_path as string;
            const content = args?.content as string;
            if (!filePath || typeof filePath !== 'string') {
              throw new Error('file_path is required and must be a string');
            }
            if (!content || typeof content !== 'string') {
              throw new Error('content is required and must be a string');
            }
            const result = await this.writeFile(filePath, content);
            return {
              content: [
                {
                  type: 'text',
                  text: result,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        this.logger.error(`Error executing tool ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Unknown error occurred',
              }),
            },
          ],
          isError: true,
        };
      }
    };
    this.server.setRequestHandler(CallToolRequestSchema, this.callToolHandler);
  }

  /**
   * Загружает содержимое по URL
   */
  private async fetch(
    url: string,
    headers?: Record<string, string>,
  ): Promise<string> {
    try {
      this.logger.log(`Fetching content from URL: ${url}`);

      const fetchHeaders: HeadersInit = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers,
      };

      const response = await fetch(url, {
        method: 'GET',
        headers: fetchHeaders,
        signal: AbortSignal.timeout(30000), // 30 секунд таймаут
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`,
        );
      }

      const contentType = response.headers.get('content-type') || '';
      let content: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        content = await response.text();
      }

      const result: FetchResult = {
        url,
        content,
        statusCode: response.status,
        contentType,
      };

      // Попытка извлечь title из HTML
      if (contentType.includes('text/html')) {
        const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          result.title = titleMatch[1].trim();
        }
      }

      this.logger.log(
        `Successfully fetched content from ${url}, length: ${content.length} chars`,
      );

      return JSON.stringify(result);
    } catch (error) {
      this.logger.error(`Error fetching content from ${url}`, error);
      const errorResult: FetchResult = {
        url,
        content: '',
        statusCode: 0,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
      return JSON.stringify(errorResult);
    }
  }

  /**
   * Сохраняет markdown файл
   */
  private async writeFile(filePath: string, content: string): Promise<string> {
    try {
      this.logger.log(`Writing file: ${filePath}`);

      // Если путь относительный, сохраняем в documentsDir
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.documentsDir, filePath);

      // Создаем директорию, если не существует
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Сохраняем файл
      await fs.writeFile(fullPath, content, 'utf-8');

      const result: WriteFileResult = {
        success: true,
        filePath: fullPath,
        message: `File successfully saved to ${fullPath}`,
      };

      this.logger.log(`File successfully saved to ${fullPath}`);
      return JSON.stringify(result);
    } catch (error) {
      this.logger.error(`Error writing file ${filePath}`, error);
      const errorResult: WriteFileResult = {
        success: false,
        filePath,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
      return JSON.stringify(errorResult);
    }
  }

  /**
   * Получает список доступных инструментов
   */
  async listTools() {
    if (!this.listToolsHandler) {
      throw new Error('List tools handler not found');
    }
    return await this.listToolsHandler({
      method: 'tools/list',
      params: {},
    });
  }

  /**
   * Вызывает инструмент
   */
  async callTool(name: string, args: Record<string, any>) {
    if (!this.callToolHandler) {
      throw new Error('Call tool handler not found');
    }
    return await this.callToolHandler({
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    });
  }

  /**
   * Получает экземпляр сервера для прямого доступа
   */
  getServer(): Server {
    return this.server;
  }
}
