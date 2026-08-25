import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { SUMMARY_QUEUE } from '../../common/constants/rag.constants';
import { ConversationMemoryService } from '../chat/conversation-memory.service';
import {
  KnowledgeSummaryJobData,
  KnowledgeSummaryService,
} from './knowledge-summary.service';

@Processor(SUMMARY_QUEUE)
export class SummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(SummaryProcessor.name);

  constructor(
    private readonly memory: ConversationMemoryService,
    private readonly knowledge: KnowledgeSummaryService,
  ) {
    super();
  }

  async process(job: Job<KnowledgeSummaryJobData>): Promise<void> {
    this.logger.log(`Summary job ${job.id} kind=${job.data.kind}`);

    if (job.data.kind === 'CONVERSATION') {
      await this.memory.refreshSummary(job.data.conversationId);
      return;
    }

    await this.knowledge.processJob(job.data);
  }
}
