import { Module, forwardRef } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { QueuesModule } from '../queues/queues.module';
import { KnowledgeSummaryService } from './knowledge-summary.service';
import { SummariesController } from './summaries.controller';
import { SummaryProcessor } from './summary.processor';

@Module({
  imports: [QueuesModule, forwardRef(() => ChatModule)],
  controllers: [SummariesController],
  providers: [KnowledgeSummaryService, SummaryProcessor],
  exports: [KnowledgeSummaryService],
})
export class SummariesModule {}
