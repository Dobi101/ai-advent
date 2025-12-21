import { Injectable, Logger } from '@nestjs/common';
import { BaseTool, ToolDefinition, ToolResult } from '../base-tool';
import { DockerService } from './docker.service';

@Injectable()
export class ExecuteInContainerTool extends BaseTool {
  protected readonly logger = new Logger(ExecuteInContainerTool.name);

  constructor(private readonly dockerService: DockerService) {
    super();
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'execute_in_container',
      description: 'Выполняет команду внутри работающего Docker контейнера.',
      inputSchema: {
        type: 'object',
        properties: {
          container_id: {
            type: 'string',
            description: 'ID или имя контейнера',
          },
          command: {
            type: 'string',
            description: 'Команда для выполнения (например: "ls -la")',
          },
          workdir: {
            type: 'string',
            description: 'Рабочая директория внутри контейнера',
          },
        },
        required: ['container_id', 'command'],
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const containerId = args.container_id as string;
    const command = args.command as string;
    const workdir = args.workdir as string | undefined;

    if (!containerId || typeof containerId !== 'string') {
      return this.error('container_id is required and must be a string');
    }

    if (!command || typeof command !== 'string') {
      return this.error('command is required and must be a string');
    }

    try {
      this.logger.log(
        `Выполнение команды "${command}" в контейнере ${containerId}`,
      );

      // Разбиваем команду на части для передачи в exec
      const commandParts = command.split(/\s+/);

      const result = await this.dockerService.execInContainer(
        containerId,
        commandParts,
        workdir,
      );

      return this.success({
        success: true,
        containerId,
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (error) {
      this.logger.error(`Ошибка выполнения команды в ${containerId}`, error);
      return this.error(
        error instanceof Error
          ? error.message
          : 'Ошибка выполнения команды в контейнере',
      );
    }
  }
}
