import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { GptService } from './gpt.service';

@Controller('gpt')
export class GptController {
  constructor(private readonly gptService: GptService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() body: { message: string }) {
    const response = await this.gptService.sendMessage(body.message);
    return {
      success: true,
      response,
    };
  }
}
