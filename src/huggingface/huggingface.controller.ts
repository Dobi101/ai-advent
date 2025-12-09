import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { HuggingFaceService } from './huggingface.service';

@Controller('huggingface')
export class HuggingFaceController {
  constructor(private readonly huggingFaceService: HuggingFaceService) {}

  @Post('deepseek')
  @HttpCode(HttpStatus.OK)
  async chatWithDeepSeek(@Body() body: { message: string }) {
    const result = await this.huggingFaceService.chatWithDeepSeek(body.message);
    return {
      success: true,
      response: result.response,
      responseTime: result.responseTime,
      tokens: result.tokens,
    };
  }

  @Post('gpt-oss')
  @HttpCode(HttpStatus.OK)
  async chatWithGPTOSS(@Body() body: { message: string }) {
    const result = await this.huggingFaceService.chatWithGPTOSS(body.message);
    return {
      success: true,
      response: result.response,
      responseTime: result.responseTime,
      tokens: result.tokens,
    };
  }
}
