import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { DOCUMENT_QUEUE } from '../../common/constants/rag.constants';
import { DocumentProcessingService } from './document-processing.service';

export type DocumentJobData = { documentId: string };

@Processor(DOCUMENT_QUEUE)
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    private readonly documentProcessingService: DocumentProcessingService,
  ) {
    super();
  }

  async process(job: Job<DocumentJobData>): Promise<void> {
    this.logger.log(`Processing document job ${job.id} → ${job.data.documentId}`);
    await this.documentProcessingService.processDocument(job.data.documentId);
  }
}
