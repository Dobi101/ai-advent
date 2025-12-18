import { Module } from '@nestjs/common';
import { GptService } from './gpt.service';
import { GptController } from './gpt.controller';
import { MemoryService } from './services/memory.service';
import { ChatHistoryService } from './services/chat-history.service';
import { FunctionCallHandlerService } from './services/function-call-handler.service';
import { GigaChatClientService } from './services/gigachat-client.service';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [McpModule],
  controllers: [GptController],
  providers: [
    GptService,
    MemoryService,
    ChatHistoryService,
    FunctionCallHandlerService,
    GigaChatClientService,
  ],
  exports: [GptService],
})
export class GptModule {}
