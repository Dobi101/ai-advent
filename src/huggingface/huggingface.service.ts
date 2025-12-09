import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InferenceClient } from '@huggingface/inference';
import { HuggingFaceResponse } from './interfaces/interfaces';

@Injectable()
export class HuggingFaceService implements OnModuleInit {
  private readonly logger = new Logger(HuggingFaceService.name);
  private client: InferenceClient;

  onModuleInit() {
    try {
      this.client = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
      this.logger.log('Hugging Face Inference client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Hugging Face client', error);
      throw error;
    }
  }

  async chatWithDeepSeek(message: string): Promise<HuggingFaceResponse> {
    const startTime = Date.now();
    try {
      this.logger.log(`Sending message to DeepSeek-V3.2: ${message}`);

      const response = await this.client.chatCompletion({
        model: 'deepseek-ai/DeepSeek-V3.2',
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from DeepSeek-V3.2');
      }

      const content = response.choices[0]?.message.content;
      const usage = response.usage;

      this.logger.log(
        `DeepSeek-V3.2 response received in ${responseTime}ms, tokens: ${usage?.total_tokens || 'N/A'}`,
      );

      return {
        response: content || '',
        responseTime,
        tokens: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.logger.error(
        `Error communicating with DeepSeek-V3.2 after ${responseTime}ms`,
        error,
      );
      throw new Error('Failed to get response from DeepSeek-V3.2');
    }
  }

  async chatWithGPTOSS(message: string): Promise<HuggingFaceResponse> {
    const startTime = Date.now();
    try {
      this.logger.log(`Sending message to gpt-oss-120b:groq: ${message}`);

      const response = await this.client.chatCompletion({
        model: 'openai/gpt-oss-120b:groq',
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from gpt-oss-120b:groq');
      }

      const content = response.choices[0]?.message.content;
      const usage = response.usage;

      this.logger.log(
        `gpt-oss-120b:groq response received in ${responseTime}ms, tokens: ${usage?.total_tokens || 'N/A'}`,
      );

      return {
        response: content || '',
        responseTime,
        tokens: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.logger.error(
        `Error communicating with gpt-oss-120b:groq after ${responseTime}ms`,
        error,
      );
      throw new Error('Failed to get response from gpt-oss-120b:groq');
    }
  }
}
