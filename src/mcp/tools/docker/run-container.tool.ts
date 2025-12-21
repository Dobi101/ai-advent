import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class RunContainerTool extends BaseTool {
  protected readonly logger = new Logger(RunContainerTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'run_container',
      description:
        'Запускает Docker контейнер из образа с возможностью проброса портов.',
      inputSchema: {
        type: 'object',
        properties: {
          image: {
            type: 'string',
            description: 'Имя образа (например: "nginx:latest")',
          },
          name: {
            type: 'string',
            description: 'Имя контейнера (опционально)',
          },
          ports: {
            type: 'object',
            description:
              'Маппинг портов { "containerPort": "hostPort" }, например: { "80": "8080" }',
            additionalProperties: {
              type: 'string',
            },
          },
          env: {
            type: 'object',
            description: 'Переменные окружения { "KEY": "value" }',
            additionalProperties: {
              type: 'string',
            },
          },
        },
        required: ['image'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const image = args.image as string;
    const name = args.name as string | undefined;
    const ports = args.ports as Record<string, string> | undefined;
    const env = args.env as Record<string, string> | undefined;

    if (!image || typeof image !== 'string') {
      return this.error('image is required and must be a string');
    }

    try {
      this.logger.log(`Запуск контейнера из образа ${image}`);

      const result = await this.dockerService.runContainer(image, {
        name,
        ports,
        env,
        detach: true,
      });

      return this.success({
        success: true,
        containerId: result.containerId,
        name: result.name,
        ports,
        message: `Контейнер ${result.name} успешно запущен`,
      });
    } catch (error) {
      this.logger.error(`Ошибка запуска контейнера из ${image}`, error);
      return this.error(
        error instanceof Error ? error.message : 'Ошибка запуска контейнера',
      );
    }
  }
}
