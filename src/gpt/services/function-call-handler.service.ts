import { Injectable, Logger } from '@nestjs/common';
import { OpenMeteoService } from '../open-meteo.service';
// import { McpService } from '../mcp.service'; // Временно отключен

@Injectable()
export class FunctionCallHandlerService {
  private readonly logger = new Logger(FunctionCallHandlerService.name);
  private reminderService: any = null;

  constructor(
    private readonly openMeteoService: OpenMeteoService,
    // private readonly mcpService: McpService, // Временно отключен
  ) {}

  /**
   * Устанавливает ReminderService (используется для избежания циклических зависимостей)
   */
  setReminderService(reminderService: any) {
    this.reminderService = reminderService;
  }

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

      // Проверяем, является ли это MCP tool (временно отключено)
      // const isMcpTool = await this.mcpService.isMcpTool(functionName);
      // if (isMcpTool) {
      //   return await this.mcpService.callTool(functionName, functionArgs);
      // }

      // Обрабатываем reminder tools
      if (this.reminderService) {
        switch (functionName) {
          case 'get_reminder_tasks': {
            const tasks = await this.reminderService.handleGetTasks();
            return JSON.stringify(tasks, null, 2);
          }
        }
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
      }

      // Если функция не найдена ни в одном из обработчиков
      throw new Error(`Unknown function: ${functionName}`);
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
