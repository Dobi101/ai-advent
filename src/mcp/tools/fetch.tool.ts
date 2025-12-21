import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from './base-tool';
import { FetchResult } from '../interfaces/mcp.interfaces';

@Injectable()
export class FetchTool extends BaseTool {
  protected readonly logger = new Logger(FetchTool.name);

  getDefinition(): ToolDefinition {
    return {
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
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    const headers = (args.headers as Record<string, string>) || {};

    if (!url || typeof url !== 'string') {
      return this.error('URL is required and must be a string');
    }

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
        signal: AbortSignal.timeout(30000),
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

      if (contentType.includes('text/html')) {
        const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          result.title = titleMatch[1].trim();
        }
      }

      this.logger.log(
        `Successfully fetched content from ${url}, length: ${content.length} chars`,
      );

      return this.success(result);
    } catch (error) {
      this.logger.error(`Error fetching content from ${url}`, error);
      const errorResult: FetchResult = {
        url,
        content: '',
        statusCode: 0,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
      return this.success(errorResult);
    }
  }
}
