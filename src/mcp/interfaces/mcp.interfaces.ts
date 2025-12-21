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

// Docker interfaces

export interface BuildImageResult {
  success: boolean;
  imageId?: string;
  tag?: string;
  message?: string;
  error?: string;
}

export interface RunContainerResult {
  success: boolean;
  containerId?: string;
  name?: string;
  ports?: Record<string, string>;
  message?: string;
  error?: string;
}

export interface ContainerLogsResult {
  success: boolean;
  containerId: string;
  logs?: string;
  error?: string;
}

export interface ContainerStatusResult {
  success: boolean;
  containerId: string;
  status?: string;
  state?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
}

export interface StopContainerResult {
  success: boolean;
  containerId: string;
  message?: string;
  error?: string;
}

export interface ListContainersResult {
  success: boolean;
  count: number;
  containers: Array<{
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: Array<{
      privatePort: number;
      publicPort?: number;
      type: string;
    }>;
    created: number;
  }>;
  error?: string;
}

export interface ExecuteInContainerResult {
  success: boolean;
  containerId: string;
  command: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface HealthCheckResult {
  success: boolean;
  url: string;
  statusCode?: number;
  body?: string;
  attempts: number;
  message?: string;
  error?: string;
}
