import { Injectable, Logger } from '@nestjs/common';
import { OpenMeteoService } from '../open-meteo.service';
import { McpService } from '../mcp.service';

@Injectable()
export class FunctionCallHandlerService {
  private readonly logger = new Logger(FunctionCallHandlerService.name);

  constructor(
    private readonly openMeteoService: OpenMeteoService,
    private readonly mcpService: McpService,
  ) {}

  /**
   * Обрабатывает вызов функции и выполняет соответствующий запрос
   */
  async handleFunctionCall(
    functionName: string,
    functionArgs: { [key: string]: any },
  ): Promise<string> {
    try {
      this.logger.log(
        `Handling function call: ${functionName} with args: ${JSON.stringify(functionArgs)}`,
      );

      // Проверяем, является ли это MCP tool
      const isMcpTool = await this.mcpService.isMcpTool(functionName);
      if (isMcpTool) {
        return await this.mcpService.callTool(functionName, functionArgs);
      }

      // Обрабатываем open-meteo tools
      switch (functionName) {
        case 'get_weather_forecast': {
          const forecast = await this.openMeteoService.getWeatherForecast({
            latitude: functionArgs.latitude,
            longitude: functionArgs.longitude,
            forecast_days: functionArgs.forecast_days,
            hourly: functionArgs.hourly,
            daily: functionArgs.daily,
            timezone: functionArgs.timezone,
          });
          return JSON.stringify(forecast, null, 2);
        }
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
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
