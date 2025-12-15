import { Module } from '@nestjs/common';
import { GptService } from './gpt.service';
import { GptController } from './gpt.controller';
import { OpenMeteoService } from './open-meteo.service';
import { MemoryService } from './services/memory.service';
import { ChatHistoryService } from './services/chat-history.service';
import { FunctionCallHandlerService } from './services/function-call-handler.service';
import { GigaChatClientService } from './services/gigachat-client.service';

@Module({
  controllers: [GptController],
  providers: [
    GptService,
    OpenMeteoService,
    MemoryService,
    ChatHistoryService,
    FunctionCallHandlerService,
    GigaChatClientService,
  ],
})
export class GptModule {}
