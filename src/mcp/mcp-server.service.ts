import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './tools/base-tool';
import { FetchTool } from './tools/fetch.tool';
import { WriteFileTool } from './tools/write-file.tool';
import { BuildImageTool } from './tools/docker/build-image.tool';
import { RunContainerTool } from './tools/docker/run-container.tool';
import { ContainerLogsTool } from './tools/docker/container-logs.tool';
import { ContainerStatusTool } from './tools/docker/container-status.tool';
import { StopContainerTool } from './tools/docker/stop-container.tool';
import { ListContainersTool } from './tools/docker/list-containers.tool';
import { ExecuteInContainerTool } from './tools/docker/execute-in-container.tool';
import { HealthCheckTool } from './tools/docker/health-check.tool';

@Injectable()
export class McpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpServerService.name);
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private readonly tools: BaseTool[];

  constructor(
    fetchTool: FetchTool,
    writeFileTool: WriteFileTool,
    buildImageTool: BuildImageTool,
    runContainerTool: RunContainerTool,
    containerLogsTool: ContainerLogsTool,
    containerStatusTool: ContainerStatusTool,
    stopContainerTool: StopContainerTool,
    listContainersTool: ListContainersTool,
    executeInContainerTool: ExecuteInContainerTool,
    healthCheckTool: HealthCheckTool,
  ) {
    this.tools = [
      fetchTool,
      writeFileTool,
      buildImageTool,
      runContainerTool,
      containerLogsTool,
      containerStatusTool,
      stopContainerTool,
      listContainersTool,
      executeInContainerTool,
      healthCheckTool,
    ];

    this.server = new Server(
      {
        name: 'advent-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupTools();
  }

  onModuleInit() {
    this.logger.log('MCP Server initialized');
    this.logger.log(`Зарегистрировано инструментов: ${this.tools.length}`);
  }

  async onModuleDestroy() {
    if (this.transport) {
      await this.transport.close();
    }
    this.logger.log('MCP Server destroyed');
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return {
        tools: this.tools.map((tool) => tool.getDefinition()),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = this.tools.find((t) => t.getDefinition().name === name);

      if (!tool) {
        this.logger.error(`Unknown tool: ${name}`);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                message: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        this.logger.log(`Вызов инструмента: ${name}`);
        return await tool.execute(args || {});
      } catch (error) {
        this.logger.error(`Error executing tool ${name}`, error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Unknown error occurred',
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  listTools() {
    return {
      tools: this.tools.map((tool) => tool.getDefinition()),
    };
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const tool = this.tools.find((t) => t.getDefinition().name === name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return await tool.execute(args);
  }

  getServer(): Server {
    return this.server;
  }
}
