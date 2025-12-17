import {
  Module,
  OnModuleInit,
  forwardRef,
  Inject,
  Logger,
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReminderService } from './reminder.service';
import { ReminderScheduler } from './reminder.scheduler';
import { GptModule } from '../gpt/gpt.module';
import { GptService } from '../gpt/gpt.service';
import { FunctionCallHandlerService } from '../gpt/services/function-call-handler.service';

@Module({
  imports: [ScheduleModule, forwardRef(() => GptModule)],
  providers: [ReminderService, ReminderScheduler],
  exports: [ReminderService],
})
export class ReminderModule implements OnModuleInit {
  private readonly logger = new Logger(ReminderModule.name);

  constructor(
    private readonly reminderService: ReminderService,
    @Inject(forwardRef(() => GptService))
    private readonly gptService: GptService,
    @Inject(forwardRef(() => FunctionCallHandlerService))
    private readonly functionCallHandler: FunctionCallHandlerService,
  ) {}

  onModuleInit() {
    // Регистрируем ReminderService в GptService и FunctionCallHandlerService
    // для избежания циклических зависимостей
    // Это выполняется синхронно, чтобы гарантировать инициализацию до OnApplicationBootstrap
    this.gptService.setReminderService(this.reminderService);
    this.functionCallHandler.setReminderService(this.reminderService);
    this.reminderService.setGptService(this.gptService);
    this.logger.log(
      'ReminderModule: GptService initialized for ReminderService',
    );
  }
}
