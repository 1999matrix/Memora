import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { SUMMARY_QUEUE } from '../../common/constants/rag.constants';
import { ConversationMemoryService } from './conversation-memory.service';

export type SummaryJobData = { conversationId: string };

@Processor(SUMMARY_QUEUE)
export class SummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(SummaryProcessor.name);

  constructor(private readonly memory: ConversationMemoryService) {
    super();
  }

  async process(job: Job<SummaryJobData>): Promise<void> {
    this.logger.log(
      `Summary job ${job.id} → conversation ${job.data.conversationId}`,
    );
    await this.memory.refreshSummary(job.data.conversationId);
  }
}
