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

// Open-Meteo API interfaces
export interface OpenMeteoForecastRequest {
  latitude: number;
  longitude: number;
  forecast_days?: number;
  hourly?: string[];
  daily?: string[];
  timezone?: string;
}

export interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  elevation?: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  hourly?: {
    time: string[];
    [key: string]: any;
  };
  hourly_units?: {
    [key: string]: string;
  };
  daily?: {
    time: string[];
    [key: string]: any;
  };
  daily_units?: {
    [key: string]: string;
  };
  current?: {
    time: string;
    interval: number;
    [key: string]: any;
  };
}
