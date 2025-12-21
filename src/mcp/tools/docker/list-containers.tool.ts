import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class ListContainersTool extends BaseTool {
  protected readonly logger = new Logger(ListContainersTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'list_containers',
      description: 'Показывает список всех Docker контейнеров.',
      inputSchema: {
        type: 'object',
        properties: {
          all: {
            type: 'boolean',
            description:
              'Показать все контейнеры, включая остановленные (по умолчанию только running)',
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const all = (args.all as boolean) ?? false;

    try {
      this.logger.log(`Получение списка контейнеров (all=${all})`);

      const containers = await this.dockerService.listContainers(all);

      return this.success({
        success: true,
        count: containers.length,
        containers,
      });
    } catch (error) {
      this.logger.error('Ошибка получения списка контейнеров', error);
      return this.error(
        error instanceof Error
          ? error.message
          : 'Ошибка получения списка контейнеров',
      );
    }
  }
}
