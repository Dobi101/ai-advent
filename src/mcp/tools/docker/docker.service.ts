import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Docker from 'dockerode';

export interface ContainerInfo {
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
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

@Injectable()
export class DockerService implements OnModuleInit {
  private readonly logger = new Logger(DockerService.name);
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async onModuleInit() {
    try {
      await this.ping();
      this.logger.log('Docker daemon подключен');
    } catch {
      this.logger.warn(
        'Docker daemon недоступен. Docker инструменты не будут работать.',
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      throw this.handleDockerError(error, 'ping');
    }
  }

  async buildImage(
    contextPath: string,
    tag: string,
    dockerfile = 'Dockerfile',
  ): Promise<{ imageId: string; tag: string }> {
    try {
      this.logger.log(`Сборка образа ${tag} из ${contextPath}`);

      const stream = await this.docker.buildImage(
        {
          context: contextPath,
          src: [dockerfile],
        },
        { t: tag, dockerfile },
      );

      return new Promise((resolve, reject) => {
        let imageId = '';

        this.docker.modem.followProgress(
          stream,
          (err, output) => {
            if (err) {
              reject(this.handleDockerError(err, 'build'));
              return;
            }

            const lastOutput = output[output.length - 1];
            if (lastOutput?.aux?.ID) {
              imageId = lastOutput.aux.ID;
            }

            this.logger.log(`Образ ${tag} успешно собран`);
            resolve({ imageId, tag });
          },
          (event) => {
            if (event.stream) {
              this.logger.debug(event.stream.trim());
            }
            if (event.aux?.ID) {
              imageId = event.aux.ID;
            }
          },
        );
      });
    } catch (error) {
      throw this.handleDockerError(error, 'build');
    }
  }

  async runContainer(
    image: string,
    options: {
      name?: string;
      ports?: Record<string, string>;
      env?: Record<string, string>;
      detach?: boolean;
    } = {},
  ): Promise<{ containerId: string; name: string }> {
    try {
      this.logger.log(`Запуск контейнера из образа ${image}`);

      const exposedPorts: Record<string, object> = {};
      const portBindings: Record<string, Array<{ HostPort: string }>> = {};

      if (options.ports) {
        for (const [containerPort, hostPort] of Object.entries(options.ports)) {
          const portKey = `${containerPort}/tcp`;
          exposedPorts[portKey] = {};
          portBindings[portKey] = [{ HostPort: hostPort }];
        }
      }

      const envArray = options.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : [];

      const container = await this.docker.createContainer({
        Image: image,
        name: options.name,
        Env: envArray,
        ExposedPorts: exposedPorts,
        HostConfig: {
          PortBindings: portBindings,
        },
      });

      await container.start();

      const info = await container.inspect();
      const containerName = info.Name.replace(/^\//, '');

      this.logger.log(
        `Контейнер ${containerName} (${container.id.slice(0, 12)}) запущен`,
      );

      return {
        containerId: container.id,
        name: containerName,
      };
    } catch (error) {
      throw this.handleDockerError(error, 'run');
    }
  }

  async getContainerLogs(
    containerId: string,
    options: { tail?: number; timestamps?: boolean } = {},
  ): Promise<string> {
    try {
      const container = this.docker.getContainer(containerId);

      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail ?? 100,
        timestamps: options.timestamps ?? false,
      });

      return this.demuxStream(logs);
    } catch (error) {
      throw this.handleDockerError(error, 'logs');
    }
  }

  async getContainerStatus(containerId: string): Promise<{
    status: string;
    state: string;
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number;
  }> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      return {
        status: info.State.Status,
        state: info.State.Running
          ? 'running'
          : info.State.Paused
            ? 'paused'
            : info.State.Restarting
              ? 'restarting'
              : 'stopped',
        startedAt: info.State.StartedAt,
        finishedAt: info.State.FinishedAt,
        exitCode: info.State.ExitCode,
      };
    } catch (error) {
      throw this.handleDockerError(error, 'status');
    }
  }

  async stopContainer(
    containerId: string,
    timeout = 10,
  ): Promise<{ stopped: boolean }> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });

      this.logger.log(`Контейнер ${containerId.slice(0, 12)} остановлен`);
      return { stopped: true };
    } catch (error) {
      throw this.handleDockerError(error, 'stop');
    }
  }

  async listContainers(all = false): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all });

      return containers.map((c) => ({
        id: c.Id,
        name: c.Names[0]?.replace(/^\//, '') || '',
        image: c.Image,
        status: c.Status,
        state: c.State,
        ports: c.Ports.map((p) => ({
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort,
          type: p.Type,
        })),
        created: c.Created,
      }));
    } catch (error) {
      throw this.handleDockerError(error, 'list');
    }
  }

  async execInContainer(
    containerId: string,
    command: string[],
    workdir?: string,
  ): Promise<ExecResult> {
    try {
      const container = this.docker.getContainer(containerId);

      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: workdir,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      return new Promise((resolve, reject) => {
        let stdout = '';
        const stderr = '';

        stream.on('data', (chunk: Buffer) => {
          const output = this.demuxStream(chunk);
          stdout += output;
        });

        stream.on('error', (err: Error) => {
          reject(this.handleDockerError(err, 'exec'));
        });

        stream.on('end', () => {
          exec
            .inspect()
            .then((inspectResult) => {
              resolve({
                exitCode: inspectResult.ExitCode ?? 0,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
              });
            })
            .catch((err) => {
              reject(this.handleDockerError(err, 'exec'));
            });
        });
      });
    } catch (error) {
      throw this.handleDockerError(error, 'exec');
    }
  }

  private demuxStream(buffer: Buffer | string): string {
    if (typeof buffer === 'string') {
      return buffer;
    }

    let result = '';
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        result += buffer.slice(offset).toString('utf8');
        break;
      }

      const size = buffer.readUInt32BE(offset + 4);

      if (offset + 8 + size > buffer.length) {
        result += buffer.slice(offset).toString('utf8');
        break;
      }

      result += buffer.slice(offset + 8, offset + 8 + size).toString('utf8');
      offset += 8 + size;
    }

    return result;
  }

  private handleDockerError(error: unknown, operation: string): Error {
    const err = error as {
      code?: string;
      statusCode?: number;
      message?: string;
    };

    if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
      return new Error(
        'Docker daemon недоступен. Убедитесь, что Docker запущен.',
      );
    }

    if (err.statusCode === 404) {
      if (operation === 'run' || operation === 'build') {
        return new Error(`Образ не найден`);
      }
      return new Error(`Контейнер не найден`);
    }

    if (err.statusCode === 409) {
      return new Error(`Контейнер с таким именем уже существует`);
    }

    if (err.message?.includes('port is already allocated')) {
      return new Error('Порт уже используется другим процессом');
    }

    if (err.message?.includes('is not running')) {
      return new Error('Контейнер не запущен');
    }

    return new Error(err.message || `Ошибка Docker при операции ${operation}`);
  }
}
