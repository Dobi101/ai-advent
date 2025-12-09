export interface HuggingFaceResponse {
  response: string;
  responseTime: number;
  tokens: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
