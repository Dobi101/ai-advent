export interface FetchResult {
  url: string;
  content: string;
  title?: string;
  statusCode: number;
  contentType?: string;
  error?: string;
}

export interface WriteFileResult {
  success: boolean;
  filePath: string;
  message?: string;
  error?: string;
}
