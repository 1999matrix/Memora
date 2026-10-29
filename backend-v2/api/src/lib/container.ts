import { Queue } from 'bullmq';

import { resolveAiProvider } from '../domain/ai/ai-provider.js';
import type { AiClient } from '../domain/ai/ai-client.interface.js';
import { HttpAiClient } from '../domain/ai/http-ai.client.js';
import { OpenAiAiClient } from '../domain/ai/openai-ai.client.js';
import { StubAiClient } from '../domain/ai/stub-ai.client.js';
import { AuditService } from '../domain/common/services/audit.service.js';
import { MembershipService } from '../domain/common/services/membership.service.js';
import {
  CONNECTOR_SYNC_QUEUE,
  DOCUMENT_QUEUE,
  SUMMARY_QUEUE,
} from '../domain/common/constants/rag.constants.js';
import { AdminService } from '../domain/modules/admin/admin.service.js';
import { UsageService } from '../domain/modules/analytics/usage.service.js';
import { AuthService } from '../domain/modules/auth/auth.service.js';
import { ChatService } from '../domain/modules/chat/chat.service.js';
import { ConversationMemoryService } from '../domain/modules/chat/conversation-memory.service.js';
import { ConnectorRegistry } from '../domain/modules/connectors/connector.registry.js';
import { ConnectorSyncService } from '../domain/modules/connectors/connector-sync.service.js';
import { ConnectorsService } from '../domain/modules/connectors/connectors.service.js';
import { DocumentsService } from '../domain/modules/documents/documents.service.js';
import { EvaluationService } from '../domain/modules/evaluation/evaluation.service.js';
import { FeedbackService } from '../domain/modules/feedback/feedback.service.js';
import { HealthService } from '../domain/modules/health/health.service.js';
import { OrganizationsService } from '../domain/modules/organizations/organizations.service.js';
import type { DocumentJobData } from '../domain/modules/queues/document-job.types.js';
import { DocumentProcessingService } from '../domain/modules/queues/document-processing.service.js';
import { RetrievalService } from '../domain/modules/retrieval/retrieval.service.js';
import type { KnowledgeSummaryJobData } from '../domain/modules/summaries/knowledge-summary.service.js';
import { KnowledgeSummaryService } from '../domain/modules/summaries/knowledge-summary.service.js';
import { UsersService } from '../domain/modules/users/users.service.js';
import { WorkspacesService } from '../domain/modules/workspaces/workspaces.service.js';
import { PrismaService } from '../domain/prisma/prisma.service.js';
import { RedisService } from '../domain/redis/redis.service.js';
import { LocalFileStorage } from '../domain/storage/local-file.storage.js';
import type { ConnectorSyncJobData } from '../domain/modules/connectors/connector-sync.service.js';
import { createConfigService, type AppConfigService } from './config.js';
import { JwtService } from './jwt-service.js';
import { createRedisClient } from './redis-connection.js';
import type Redis from 'ioredis';

export type AppContainer = {
  config: AppConfigService;
  prisma: PrismaService;
  redis: RedisService;
  /** Dedicated ioredis connection for BullMQ (do not share with app Redis ops). */
  bullRedis: Redis;
  documentQueue: Queue<DocumentJobData>;
  connectorSyncQueue: Queue<ConnectorSyncJobData>;
  summaryQueue: Queue<KnowledgeSummaryJobData>;
  auth: AuthService;
  users: UsersService;
  organizations: OrganizationsService;
  workspaces: WorkspacesService;
  documents: DocumentsService;
  connectors: ConnectorsService;
  connectorSync: ConnectorSyncService;
  retrieval: RetrievalService;
  chat: ChatService;
  memory: ConversationMemoryService;
  summaries: KnowledgeSummaryService;
  feedback: FeedbackService;
  admin: AdminService;
  analytics: UsageService;
  evaluation: EvaluationService;
  health: HealthService;
  documentProcessing: DocumentProcessingService;
  ai: AiClient;
};

export async function createContainer(): Promise<AppContainer> {
  const config = createConfigService();
  const prisma = new PrismaService();
  await prisma.$connect();

  const redisApp = createRedisClient(config);
  const bullRedis = createRedisClient(config);
  const redis = new RedisService(redisApp);
  await redis.connect();
  await bullRedis.connect();

  const documentQueue = new Queue<DocumentJobData>(DOCUMENT_QUEUE, {
    connection: bullRedis,
  });
  const connectorSyncQueue = new Queue<ConnectorSyncJobData>(
    CONNECTOR_SYNC_QUEUE,
    { connection: bullRedis },
  );
  const summaryQueue = new Queue<KnowledgeSummaryJobData>(SUMMARY_QUEUE, {
    connection: bullRedis,
  });

  const membership = new MembershipService(prisma);
  const audit = new AuditService(prisma);
  const users = new UsersService(prisma);
  const jwt = new JwtService();
  const auth = new AuthService(users, jwt, config);
  const storage = new LocalFileStorage(config);
  const registry = new ConnectorRegistry();

  const stubAi = new StubAiClient();
  const openAi = new OpenAiAiClient(config);
  openAi.onModuleInit();
  const serviceUrl = config.get<string>('ai.serviceUrl');
  let ai: AiClient;
  if (serviceUrl?.trim()) {
    ai = new HttpAiClient(config);
  } else {
    const provider = resolveAiProvider(
      config.get<string>('ai.provider'),
      config.get<string>('ai.openai.apiKey'),
    );
    ai = provider === 'openai' ? openAi : stubAi;
  }

  const usage = new UsageService(prisma);
  const organizations = new OrganizationsService(prisma, membership);
  const workspaces = new WorkspacesService(prisma, membership);
  const documentProcessing = new DocumentProcessingService(
    prisma,
    storage,
    ai,
    summaryQueue,
  );
  const documents = new DocumentsService(
    prisma,
    membership,
    storage,
    documentQueue,
  );
  const connectorSync = new ConnectorSyncService(
    prisma,
    registry,
    storage,
    documentQueue,
  );
  const connectors = new ConnectorsService(
    prisma,
    membership,
    registry,
    connectorSyncQueue,
  );
  const retrieval = new RetrievalService(prisma, membership, ai);
  const memory = new ConversationMemoryService(prisma, ai);
  const summaries = new KnowledgeSummaryService(
    prisma,
    membership,
    ai,
    summaryQueue,
  );
  const chat = new ChatService(
    prisma,
    membership,
    retrieval,
    memory,
    ai,
    summaryQueue,
    usage,
    audit,
  );
  const feedback = new FeedbackService(prisma, membership);
  const admin = new AdminService(prisma, redis, usage);
  const evaluation = new EvaluationService(prisma, retrieval, ai);
  const health = new HealthService(prisma, redis);

  return {
    config,
    prisma,
    redis,
    bullRedis,
    documentQueue,
    connectorSyncQueue,
    summaryQueue,
    auth,
    users,
    organizations,
    workspaces,
    documents,
    connectors,
    connectorSync,
    retrieval,
    chat,
    memory,
    summaries,
    feedback,
    admin,
    analytics: usage,
    evaluation,
    health,
    documentProcessing,
    ai,
  };
}

export async function shutdownContainer(c: AppContainer): Promise<void> {
  await c.documentQueue.close();
  await c.connectorSyncQueue.close();
  await c.summaryQueue.close();
  await c.redis.onModuleDestroy();
  if (c.bullRedis.status !== 'end') {
    await c.bullRedis.quit();
  }
  await c.prisma.$disconnect();
}
