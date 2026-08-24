import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { CONNECTOR_SYNC_QUEUE } from '../../common/constants/rag.constants';
import {
  ConnectorSyncJobData,
  ConnectorSyncService,
} from './connector-sync.service';

@Processor(CONNECTOR_SYNC_QUEUE)
export class ConnectorSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ConnectorSyncProcessor.name);

  constructor(private readonly syncService: ConnectorSyncService) {
    super();
  }

  async process(job: Job<ConnectorSyncJobData>): Promise<unknown> {
    this.logger.log(
      `Connector sync job ${job.id} → ${job.data.connectorId}`,
    );
    return this.syncService.syncConnector(job.data.connectorId);
  }
}
