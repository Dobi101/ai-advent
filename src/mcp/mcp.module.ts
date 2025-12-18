import { Module } from '@nestjs/common';
import { McpServerService } from './mcp-server.service';
import { McpClientService } from './mcp-client.service';

@Module({
  providers: [McpServerService, McpClientService],
  exports: [McpServerService, McpClientService],
})
export class McpModule {}
