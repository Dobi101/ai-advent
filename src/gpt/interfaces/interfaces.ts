export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: { [key: string]: any };
  };
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

export interface MemoryData {
  chatHistory: ChatMessage[];
  compressionCount: number;
  totalMessagesBeforeCompression: number;
  temperature: number;
  compressionThreshold: number;
  systemPrompt: string;
}
