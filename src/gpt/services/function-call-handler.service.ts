import { Injectable, Logger } from '@nestjs/common';
import { McpClientService } from '../../mcp/mcp-client.service';

@Injectable()
export class FunctionCallHandlerService {
  private readonly logger = new Logger(FunctionCallHandlerService.name);

  constructor(private readonly mcpClient: McpClientService) {}

  /**
   * Обрабатывает вызов функции и выполняет соответствующий запрос
   * Будет расширен при интеграции MCP
   */
  async handleFunctionCall(
    functionName: string,
    functionArgs: { [key: string]: any },
  ): Promise<string> {
    try {
      this.logger.log(
        `Handling function call: ${functionName} with args: ${JSON.stringify(functionArgs)}`,
      );

      // Используем MCP клиент для вызова инструментов через протокол MCP
      const result = await this.mcpClient.callTool(functionName, functionArgs);

      // Извлекаем текстовый контент из ответа MCP
      if (result.content && result.content.length > 0) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent) {
          return textContent.text;
        }
      }

      return JSON.stringify(result);
    } catch (error) {
      this.logger.error(`Error handling function call ${functionName}`, error);
      return JSON.stringify({
        error: true,
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }
}
