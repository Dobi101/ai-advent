import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class ContainerStatusTool extends BaseTool {
  protected readonly logger = new Logger(ContainerStatusTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'container_status',
      description:
        'Проверяет статус Docker контейнера (running/stopped/paused/etc).',
      inputSchema: {
        type: 'object',
        properties: {
          container_id: {
            type: 'string',
            description: 'ID или имя контейнера',
          },
        },
        required: ['container_id'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const containerId = args.container_id as string;

    if (!containerId || typeof containerId !== 'string') {
      return this.error('container_id is required and must be a string');
    }

    try {
      this.logger.log(`Проверка статуса контейнера ${containerId}`);

      const status = await this.dockerService.getContainerStatus(containerId);

      return this.success({
        success: true,
        containerId,
        ...status,
      });
    } catch (error) {
      this.logger.error(`Ошибка получения статуса ${containerId}`, error);
      return this.error(
        error instanceof Error ? error.message : 'Ошибка получения статуса',
      );
    }
  }
}
