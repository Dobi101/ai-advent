import { Module } from '@nestjs/common';
import { McpServerService } from './mcp-server.service';
import { McpClientService } from './mcp-client.service';

// Tools
import { FetchTool } from './tools/fetch.tool';
import { WriteFileTool } from './tools/write-file.tool';

// Docker tools
import { DockerService } from './tools/docker/docker.service';
import { BuildImageTool } from './tools/docker/build-image.tool';
import { RunContainerTool } from './tools/docker/run-container.tool';
import { ContainerLogsTool } from './tools/docker/container-logs.tool';
import { ContainerStatusTool } from './tools/docker/container-status.tool';
import { StopContainerTool } from './tools/docker/stop-container.tool';
import { ListContainersTool } from './tools/docker/list-containers.tool';
import { ExecuteInContainerTool } from './tools/docker/execute-in-container.tool';
import { HealthCheckTool } from './tools/docker/health-check.tool';

@Module({
  providers: [
    // Services
    McpServerService,
    McpClientService,
    DockerService,

    // Tools
    FetchTool,
    WriteFileTool,

    // Docker tools
    BuildImageTool,
    RunContainerTool,
    ContainerLogsTool,
    ContainerStatusTool,
    StopContainerTool,
    ListContainersTool,
    ExecuteInContainerTool,
    HealthCheckTool,
  ],
  exports: [McpServerService, McpClientService],
})
export class McpModule {}
