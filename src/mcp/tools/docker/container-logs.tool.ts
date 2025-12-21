import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class ContainerLogsTool extends BaseTool {
  protected readonly logger = new Logger(ContainerLogsTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'container_logs',
      description: 'Получает логи Docker контейнера.',
      inputSchema: {
        type: 'object',
        properties: {
          container_id: {
            type: 'string',
            description: 'ID или имя контейнера',
          },
          tail: {
            type: 'number',
            description: 'Количество последних строк (по умолчанию 100)',
          },
          timestamps: {
            type: 'boolean',
            description: 'Показывать временные метки',
          },
        },
        required: ['container_id'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const containerId = args.container_id as string;
    const tail = args.tail as number | undefined;
    const timestamps = args.timestamps as boolean | undefined;

    if (!containerId || typeof containerId !== 'string') {
      return this.error('container_id is required and must be a string');
    }

    try {
      this.logger.log(`Получение логов контейнера ${containerId}`);

      const logs = await this.dockerService.getContainerLogs(containerId, {
        tail,
        timestamps,
      });

      return this.success({
        success: true,
        containerId,
        logs,
      });
    } catch (error) {
      this.logger.error(`Ошибка получения логов ${containerId}`, error);
      return this.error(
        error instanceof Error ? error.message : 'Ошибка получения логов',
      );
    }
  }
}
