import { Module } from '@nestjs/common';
import { HuggingFaceService } from './huggingface.service';
import { HuggingFaceController } from './huggingface.controller';

@Module({
  controllers: [HuggingFaceController],
  providers: [HuggingFaceService],
})
export class HuggingFaceModule {}

