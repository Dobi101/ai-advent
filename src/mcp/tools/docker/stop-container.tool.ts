import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class StopContainerTool extends BaseTool {
  protected readonly logger = new Logger(StopContainerTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'stop_container',
      description: 'Останавливает Docker контейнер.',
      inputSchema: {
        type: 'object',
        properties: {
          container_id: {
            type: 'string',
            description: 'ID или имя контейнера',
          },
          timeout: {
            type: 'number',
            description:
              'Таймаут в секундах перед принудительной остановкой (по умолчанию 10)',
          },
        },
        required: ['container_id'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const containerId = args.container_id as string;
    const timeout = args.timeout as number | undefined;

    if (!containerId || typeof containerId !== 'string') {
      return this.error('container_id is required and must be a string');
    }

    try {
      this.logger.log(`Остановка контейнера ${containerId}`);

      await this.dockerService.stopContainer(containerId, timeout);

      return this.success({
        success: true,
        containerId,
        message: `Контейнер ${containerId} остановлен`,
      });
    } catch (error) {
      this.logger.error(`Ошибка остановки контейнера ${containerId}`, error);
      return this.error(
        error instanceof Error ? error.message : 'Ошибка остановки контейнера',
      );
    }
  }
}
