import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class BuildImageTool extends BaseTool {
  protected readonly logger = new Logger(BuildImageTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'build_image',
      description:
        'Собирает Docker образ из Dockerfile в указанной директории.',
      inputSchema: {
        type: 'object',
        properties: {
          context_path: {
            type: 'string',
            description: 'Путь к директории с Dockerfile',
          },
          tag: {
            type: 'string',
            description: 'Тег образа (например: "myapp:latest")',
          },
          dockerfile: {
            type: 'string',
            description: 'Имя Dockerfile (по умолчанию "Dockerfile")',
          },
        },
        required: ['context_path', 'tag'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const contextPath = args.context_path as string;
    const tag = args.tag as string;
    const dockerfile = (args.dockerfile as string) || 'Dockerfile';

    if (!contextPath || typeof contextPath !== 'string') {
      return this.error('context_path is required and must be a string');
    }

    if (!tag || typeof tag !== 'string') {
      return this.error('tag is required and must be a string');
    }

    try {
      this.logger.log(`Сборка образа ${tag} из ${contextPath}`);

      const result = await this.dockerService.buildImage(
        contextPath,
        tag,
        dockerfile,
      );

      return this.success({
        success: true,
        imageId: result.imageId,
        tag: result.tag,
        message: `Образ ${tag} успешно собран`,
      });
    } catch (error) {
      this.logger.error(`Ошибка сборки образа ${tag}`, error);
      return this.error(
        error instanceof Error ? error.message : 'Ошибка сборки образа',
      );
    }
  }
}
