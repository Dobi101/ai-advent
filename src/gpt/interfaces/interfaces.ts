export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GptResponse {
  response: string;
  responseTime: number;
  tokens: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  historyCompressed: boolean;
  historyLength: number;
}