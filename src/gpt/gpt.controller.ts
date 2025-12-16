import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GptService } from './gpt.service';

@Controller('gpt')
export class GptController {
  constructor(private readonly gptService: GptService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() body: { message: string }) {
    const result = await this.gptService.sendMessage(body.message);
    return {
      success: true,
      response: result.response,
      responseTime: result.responseTime,
      tokens: result.tokens,
      historyCompressed: result.historyCompressed,
      historyLength: result.historyLength,
    };
  }

  @Delete('history')
  @HttpCode(HttpStatus.OK)
  clearHistory() {
    this.gptService.clearHistory();
    return {
      success: true,
      message: 'Chat history cleared',
    };
  }

  @Post('system-prompt')
  @HttpCode(HttpStatus.OK)
  setSystemPrompt(@Body() body: { prompt: string }) {
    this.gptService.setSystemPrompt(body.prompt);
    return {
      success: true,
      message: 'System prompt updated',
    };
  }

  @Post('temperature')
  @HttpCode(HttpStatus.OK)
  setTemperature(@Body() body: { temperature: number }) {
    this.gptService.setTemperature(body.temperature);
    return {
      success: true,
      message: 'Temperature updated',
    };
  }

  @Get('compression-stats')
  @HttpCode(HttpStatus.OK)
  getCompressionStats() {
    const stats = this.gptService.getCompressionStats();
    return {
      success: true,
      ...stats,
    };
  }

  @Post('compression-threshold')
  @HttpCode(HttpStatus.OK)
  setCompressionThreshold(@Body() body: { threshold: number }) {
    this.gptService.setCompressionThreshold(body.threshold);
    return {
      success: true,
      message: 'Compression threshold updated',
    };
  }

  @Get('tools')
  @HttpCode(HttpStatus.OK)
  async getAvailableTools() {
    const tools = await this.gptService.getAvailableTools();
    return {
      success: true,
      tools,
    };
  }
}
