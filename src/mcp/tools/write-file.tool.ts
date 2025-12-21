import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseTool, ToolDefinition, ToolResult } from './base-tool';
import { WriteFileResult } from '../interfaces/mcp.interfaces';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class WriteFileTool extends BaseTool {
  protected readonly logger = new Logger(WriteFileTool.name);
  private readonly documentsDir: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.documentsDir =
      this.configService.get<string>('MCP_DOCUMENTS_DIR') ||
      path.join(process.cwd(), 'src', 'mcp', 'documents');
  }

  getDefinition(): ToolDefinition {
    return {
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
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const content = args.content as string;

    if (!filePath || typeof filePath !== 'string') {
      return this.error('file_path is required and must be a string');
    }

    if (!content || typeof content !== 'string') {
      return this.error('content is required and must be a string');
    }

    try {
      this.logger.log(`Writing file: ${filePath}`);

      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.documentsDir, filePath);

      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, content, 'utf-8');

      const result: WriteFileResult = {
        success: true,
        filePath: fullPath,
        message: `File successfully saved to ${fullPath}`,
      };

      this.logger.log(`File successfully saved to ${fullPath}`);
      return this.success(result);
    } catch (error) {
      this.logger.error(`Error writing file ${filePath}`, error);
      const errorResult: WriteFileResult = {
        success: false,
        filePath,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
      return this.success(errorResult);
    }
  }
}
