import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { McpServerService } from './mcp-server.service';

@Injectable()
export class McpClientService implements OnModuleInit {
  private readonly logger = new Logger(McpClientService.name);

  constructor(private readonly mcpServer: McpServerService) {}

  onModuleInit() {
    this.logger.log('MCP Client initialized (using direct server access)');
  }

  /**
   * Получает список доступных инструментов через MCP протокол
   */
  listTools() {
    return this.mcpServer.listTools();
  }

  /**
   * Вызывает инструмент через MCP протокол
   */
  async callTool(name: string, args: Record<string, any>) {
    try {
      return await this.mcpServer.callTool(name, args);
    } catch (error) {
      this.logger.error(`Error calling tool ${name}`, error);
      throw error;
    }
  }
}
