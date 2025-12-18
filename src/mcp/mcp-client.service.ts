import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerService } from './mcp-server.service';

@Injectable()
export class McpClientService implements OnModuleInit {
  private readonly logger = new Logger(McpClientService.name);
  private client: Client | null = null;

  constructor(private readonly mcpServer: McpServerService) {}

  async onModuleInit() {
    // Для работы внутри одного приложения используем прямой доступ к серверу
    // Вместо создания отдельного клиента через транспорт
    this.logger.log('MCP Client initialized (using direct server access)');
  }

  /**
   * Получает список доступных инструментов через MCP протокол
   */
  async listTools() {
    try {
      return await this.mcpServer.listTools();
    } catch (error) {
      this.logger.error('Error listing tools', error);
      throw error;
    }
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
