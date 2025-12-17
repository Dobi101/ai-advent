import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Function } from 'gigachat/interfaces';
import { Task } from './interfaces/task.interface';
import { GptService } from '../gpt/gpt.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private readonly tasksFilePath: string;
  private gptService: GptService | null = null;

  constructor() {
    // Путь к файлу tasks.json относительно корня проекта
    this.tasksFilePath = join(process.cwd(), 'src', 'reminder', 'tasks.json');
  }

  /**
   * Устанавливает GptService (используется для избежания циклических зависимостей)
   */
  setGptService(gptService: GptService) {
    this.gptService = gptService;
  }

  /**
   * Загружает задачи из JSON файла
   */
  async loadTasks(): Promise<Task[]> {
    try {
      const fileContent = await fs.readFile(this.tasksFilePath, 'utf-8');
      const tasks: Task[] = JSON.parse(fileContent);
      return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
      // Если файл не существует, создаем его с пустым массивом
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.log('Tasks file not found, creating new one');
        await this.saveTasks([]);
        return [];
      }
      this.logger.error('Error loading tasks from file', error);
      return [];
    }
  }

  /**
   * Сохраняет задачи в JSON файл
   */
  async saveTasks(tasks: Task[]): Promise<void> {
    try {
      const fileContent = JSON.stringify(tasks, null, 2);
      await fs.writeFile(this.tasksFilePath, fileContent, 'utf-8');
      this.logger.log(`Saved ${tasks.length} tasks to file`);
    } catch (error) {
      this.logger.error('Error saving tasks to file', error);
      throw error;
    }
  }

  /**
   * Получает все задачи
   */
  async getTasks(): Promise<Task[]> {
    return await this.loadTasks();
  }

  /**
   * Возвращает список всех доступных инструментов (functions) для работы с задачами
   */
  getAvailableTools(): Function[] {
    return [
      {
        name: 'get_reminder_tasks',
        description:
          'Получить список всех задач из системы напоминаний. Возвращает массив задач с их статусами, описаниями и датами создания.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  /**
   * Обрабатывает вызов MCP tool для получения задач
   */
  async handleGetTasks(): Promise<Task[]> {
    this.logger.log('MCP tool called: get_reminder_tasks');
    return await this.getTasks();
  }

  /**
   * Формирует саммари по задачам через GPT сервис
   * GPT сервис сам решит использовать ли MCP tool get_reminder_tasks для получения задач
   */
  async generateSummary(): Promise<string> {
    // Ждем инициализации GptService с таймаутом
    let attempts = 0;
    const maxAttempts = 50; // 5 секунд максимум
    while (!this.gptService && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!this.gptService) {
      this.logger.error('GptService is not initialized after waiting');
      return 'Ошибка: GptService не инициализирован. Попробуйте позже.';
    }

    try {
      const prompt = `Проанализируй задачи из системы напоминаний и создай краткое саммари с приоритетами и рекомендациями.

Используй доступный MCP tool get_reminder_tasks для получения списка задач. После получения задач проанализируй их и создай структурированное саммари, которое включает:
1. Общую статистику по задачам (сколько в каждом статусе)
2. Приоритетные задачи, требующие внимания
3. Рекомендации по дальнейшим действиям
4. Анализ прогресса выполнения задач`;

      this.logger.log(
        'Requesting GPT summary. GPT will decide to use MCP tools if needed...',
      );
      const response = await this.gptService.sendMessage(prompt);

      this.logger.log('GPT summary generated successfully');
      return response.response;
    } catch (error) {
      this.logger.error('Error generating summary', error);
      return 'Ошибка при формировании саммари задач.';
    }
  }
}
