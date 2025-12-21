import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';

@Injectable()
export class HealthCheckTool extends BaseTool {
  protected readonly logger = new Logger(HealthCheckTool.name);

  getDefinition(): ToolDefinition {
    return {
      name: 'health_check',
      description:
        'Делает HTTP запрос к указанному URL для проверки работоспособности сервиса. Поддерживает повторные попытки.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'URL для проверки (например: "http://localhost:3000/health")',
          },
          method: {
            type: 'string',
            description: 'HTTP метод: GET или POST (по умолчанию GET)',
          },
          retries: {
            type: 'number',
            description: 'Количество попыток (по умолчанию 3)',
          },
          delay: {
            type: 'number',
            description:
              'Задержка между попытками в миллисекундах (по умолчанию 1000)',
          },
          timeout: {
            type: 'number',
            description: 'Таймаут запроса в миллисекундах (по умолчанию 5000)',
          },
          expected_status: {
            type: 'number',
            description: 'Ожидаемый HTTP статус код (по умолчанию 200)',
          },
        },
        required: ['url'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    const method = ((args.method as string) || 'GET').toUpperCase();
    const retries = (args.retries as number) ?? 3;
    const delay = (args.delay as number) ?? 1000;
    const timeout = (args.timeout as number) ?? 5000;
    const expectedStatus = (args.expected_status as number) ?? 200;

    if (!url || typeof url !== 'string') {
      return this.error('url is required and must be a string');
    }

    if (method !== 'GET' && method !== 'POST') {
      return this.error('method must be GET or POST');
    }

    this.logger.log(
      `Health check: ${method} ${url} (retries: ${retries}, delay: ${delay}ms)`,
    );

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < retries) {
      attempt++;

      try {
        const response = await fetch(url, {
          method,
          signal: AbortSignal.timeout(timeout),
        });

        const body = await response.text();
        const statusCode = response.status;

        if (statusCode === expectedStatus) {
          this.logger.log(
            `Health check успешен: ${url} (attempt ${attempt}/${retries})`,
          );

          return this.success({
            success: true,
            url,
            statusCode,
            body: body.slice(0, 1000), // Ограничиваем размер тела ответа
            attempts: attempt,
            message: `Сервис доступен (статус ${statusCode})`,
          });
        }

        lastError = new Error(
          `Неожиданный статус: ${statusCode} (ожидался ${expectedStatus})`,
        );
        this.logger.warn(
          `Health check attempt ${attempt}/${retries}: статус ${statusCode}`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        this.logger.warn(
          `Health check attempt ${attempt}/${retries}: ${lastError.message}`,
        );
      }

      if (attempt < retries) {
        await this.sleep(delay);
      }
    }

    this.logger.error(`Health check провален после ${retries} попыток: ${url}`);

    return this.success({
      success: false,
      url,
      statusCode: 0,
      attempts: attempt,
      error: lastError?.message || 'Сервис недоступен',
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
