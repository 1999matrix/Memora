import { Worker } from 'bullmq';

import { loadEnv } from './bootstrap/env.js';
import {
  CONNECTOR_SYNC_QUEUE,
  DOCUMENT_QUEUE,
  SUMMARY_QUEUE,
} from './domain/common/constants/rag.constants.js';
import type { ConnectorSyncJobData } from './domain/modules/connectors/connector-sync.service.js';
import type { DocumentJobData } from './domain/modules/queues/document-job.types.js';
import type { KnowledgeSummaryJobData } from './domain/modules/summaries/knowledge-summary.service.js';
import { createContainer, shutdownContainer } from './lib/container.js';

async function main() {
  loadEnv();
  const c = await createContainer();

  const documentWorker = new Worker<DocumentJobData>(
    DOCUMENT_QUEUE,
    async (job) => {
      console.log(`document job ${job.id} → ${job.data.documentId}`);
      await c.documentProcessing.processDocument(job.data.documentId);
    },
    { connection: c.bullRedis },
  );

  const connectorWorker = new Worker<ConnectorSyncJobData>(
    CONNECTOR_SYNC_QUEUE,
    async (job) => {
      console.log(`connector sync ${job.id} → ${job.data.connectorId}`);
      await c.connectorSync.syncConnector(job.data.connectorId);
    },
    { connection: c.bullRedis },
  );

  const summaryWorker = new Worker<KnowledgeSummaryJobData>(
    SUMMARY_QUEUE,
    async (job) => {
      console.log(`summary job ${job.id} kind=${job.data.kind}`);
      if (job.data.kind === 'CONVERSATION') {
        await c.memory.refreshSummary(job.data.conversationId);
        return;
      }
      await c.summaries.processJob(job.data);
    },
    { connection: c.bullRedis },
  );

  const close = async () => {
    await documentWorker.close();
    await connectorWorker.close();
    await summaryWorker.close();
    await shutdownContainer(c);
    process.exit(0);
  };
  process.on('SIGINT', () => void close());
  process.on('SIGTERM', () => void close());

  console.log('Memora worker v2 running (document, connector, summary queues)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
