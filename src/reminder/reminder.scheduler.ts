import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReminderService } from './reminder.service';

@Injectable()
export class ReminderScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(private readonly reminderService: ReminderService) {}

  /**
   * Выполняется после инициализации всех модулей
   * Это гарантирует, что ReminderModule.onModuleInit уже выполнился
   */
  async onApplicationBootstrap() {
    this.logger.log('Application bootstrapped, generating initial summary...');
    await this.logSummary();
  }

  /**
   * Cron-задача: выполняется каждый день в 7:00
   */
  @Cron('0 7 * * *')
  async handleDailyReminder() {
    this.logger.log('Daily reminder triggered at 7:00 AM');
    await this.logSummary();
  }

  /**
   * Логирует саммари задач в консоль
   * GPT сервис автоматически использует MCP инструменты через function calls
   */
  private async logSummary() {
    try {
      this.logger.log('Generating summary with MCP tools integration...');
      const summary = await this.reminderService.generateSummary();
      this.logger.log('='.repeat(60));
      this.logger.log('[Reminder Summary - Generated with MCP Tools]');
      this.logger.log('='.repeat(60));
      this.logger.log(summary);
      this.logger.log('='.repeat(60));
    } catch (error) {
      this.logger.error('Error logging summary', error);
    }
  }
}
