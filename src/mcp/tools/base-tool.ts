import { Logger } from '@nestjs/common';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export abstract class BaseTool {
  protected abstract readonly logger: Logger;

  abstract getDefinition(): ToolDefinition;

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  protected success(data: unknown): ToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data),
        },
      ],
    };
  }

  protected error(message: string): ToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            message,
          }),
        },
      ],
      isError: true,
    };
  }
}
