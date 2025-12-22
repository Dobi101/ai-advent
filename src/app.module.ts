import { Module } from '@nestjs/common';
import { GptModule } from './gpt/gpt.module';
import { McpModule } from './mcp/mcp.module';
import { DocumentIndexingModule } from './modules/document-indexing/document-indexing.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    McpModule,
    GptModule,
    DocumentIndexingModule,
  ],
})
export class AppModule {}
