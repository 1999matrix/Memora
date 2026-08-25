import { createHash } from 'crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  AI_CLIENT,
  type AiClient,
} from '../../ai/ai-client.interface';
import { SUMMARY_QUEUE } from '../../common/constants/rag.constants';
import { MembershipService } from '../../common/services/membership.service';
import { WorkspaceRole } from '../../common/enums/workspace-role.enum';
import { PrismaService } from '../../prisma';

export type KnowledgeSummaryJobData =
  | { kind: 'DOCUMENT'; documentId: string }
  | { kind: 'WORKSPACE'; workspaceId: string }
  | { kind: 'CONNECTOR'; connectorId: string }
  | { kind: 'CONVERSATION'; conversationId: string };

@Injectable()
export class KnowledgeSummaryService {
  private readonly logger = new Logger(KnowledgeSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
    @InjectQueue(SUMMARY_QUEUE)
    private readonly summaryQueue: Queue<KnowledgeSummaryJobData>,
  ) {}

  async enqueueDocumentForUser(userId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundException('Document not found');
    await this.membership.assertWorkspaceMember(userId, document.workspaceId);
    await this.enqueueDocument(documentId);
    return { status: 'queued', kind: 'DOCUMENT', documentId };
  }

  async enqueueDocument(documentId: string) {
    await this.summaryQueue.add(
      'document',
      { kind: 'DOCUMENT', documentId },
      {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  async enqueueWorkspace(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceRole(userId, workspaceId, [
      WorkspaceRole.ADMIN,
    ]);
    await this.summaryQueue.add(
      'workspace',
      { kind: 'WORKSPACE', workspaceId },
      {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    return { status: 'queued', kind: 'WORKSPACE', workspaceId };
  }

  async enqueueConnector(userId: string, connectorId: string) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) throw new NotFoundException('Connector not found');
    await this.membership.assertWorkspaceRole(
      userId,
      connector.workspaceId,
      [WorkspaceRole.ADMIN],
    );
    await this.summaryQueue.add(
      'connector',
      { kind: 'CONNECTOR', connectorId },
      {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    return { status: 'queued', kind: 'CONNECTOR', connectorId };
  }

  async listForWorkspace(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.knowledgeSummary.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        kind: true,
        title: true,
        summary: true,
        documentId: true,
        connectorId: true,
        updatedAt: true,
      },
    });
  }

  async processJob(data: KnowledgeSummaryJobData): Promise<void> {
    if (data.kind === 'DOCUMENT') {
      await this.summarizeDocument(data.documentId);
      const doc = await this.prisma.document.findUnique({
        where: { id: data.documentId },
        select: { workspaceId: true },
      });
      if (doc) {
        await this.summaryQueue.add(
          'workspace',
          { kind: 'WORKSPACE', workspaceId: doc.workspaceId },
          {
            removeOnComplete: 50,
            removeOnFail: 20,
            attempts: 2,
            backoff: { type: 'exponential', delay: 2000 },
            delay: 1500,
          },
        );
      }
      return;
    }
    if (data.kind === 'WORKSPACE') {
      await this.summarizeWorkspace(data.workspaceId);
      return;
    }
    if (data.kind === 'CONNECTOR') {
      await this.summarizeConnector(data.connectorId);
      const connector = await this.prisma.connector.findUnique({
        where: { id: data.connectorId },
        select: { workspaceId: true },
      });
      if (connector) {
        await this.summaryQueue.add(
          'workspace',
          { kind: 'WORKSPACE', workspaceId: connector.workspaceId },
          {
            removeOnComplete: 50,
            removeOnFail: 20,
            attempts: 2,
            delay: 1500,
          },
        );
      }
    }
  }

  async summarizeDocument(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!document || document.status !== 'READY') {
      this.logger.warn(`Skip document summary — not READY: ${documentId}`);
      return;
    }

    const text =
      document.versions[0]?.extractedText ||
      `${document.name} (${document.mimeType})`;
    const sourceHash = createHash('sha256').update(text).digest('hex');

    const existing = await this.prisma.knowledgeSummary.findUnique({
      where: { documentId },
    });
    if (existing?.sourceHash === sourceHash) {
      return;
    }

    const summary = await this.ai.summarizeKnowledge({
      kind: 'DOCUMENT',
      title: document.name,
      text: text.slice(0, 12000),
    });

    await this.upsertKnowledgeSummary({
      kind: 'DOCUMENT',
      title: document.name,
      summary,
      sourceHash,
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
      connectorId: null,
    });
  }

  async summarizeWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) return;

    const docs = await this.prisma.knowledgeSummary.findMany({
      where: { workspaceId, kind: 'DOCUMENT' },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    });
    const connectors = await this.prisma.knowledgeSummary.findMany({
      where: { workspaceId, kind: 'CONNECTOR' },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });

    const text = [
      `Workspace: ${workspace.name}`,
      workspace.description || '',
      ...docs.map((d) => `Doc: ${d.title} — ${d.summary}`),
      ...connectors.map((c) => `Connector: ${c.title} — ${c.summary}`),
    ]
      .filter(Boolean)
      .join('\n');

    const sourceHash = createHash('sha256').update(text).digest('hex');
    const existing = await this.prisma.knowledgeSummary.findFirst({
      where: { workspaceId, kind: 'WORKSPACE', documentId: null, connectorId: null },
    });
    if (existing?.sourceHash === sourceHash) return;

    const summary = await this.ai.summarizeKnowledge({
      kind: 'WORKSPACE',
      title: workspace.name,
      text: text.slice(0, 12000),
    });

    if (existing) {
      await this.prisma.knowledgeSummary.update({
        where: { id: existing.id },
        data: { title: workspace.name, summary, sourceHash },
      });
      await this.writeEmbedding(existing.id, summary);
      return;
    }

    await this.upsertKnowledgeSummary({
      kind: 'WORKSPACE',
      title: workspace.name,
      summary,
      sourceHash,
      organizationId: workspace.organizationId,
      workspaceId,
      documentId: null,
      connectorId: null,
    });
  }

  async summarizeConnector(connectorId: string): Promise<void> {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: {
        documents: {
          where: { status: 'READY' },
          take: 30,
          orderBy: { updatedAt: 'desc' },
          include: {
            knowledgeSummary: true,
          },
        },
      },
    });
    if (!connector) return;

    const text = [
      `Connector: ${connector.name} (${connector.type})`,
      ...connector.documents.map(
        (d) =>
          d.knowledgeSummary?.summary ||
          `Document ${d.name} status=${d.status}`,
      ),
    ].join('\n');

    const sourceHash = createHash('sha256').update(text).digest('hex');
    const existing = await this.prisma.knowledgeSummary.findUnique({
      where: { connectorId },
    });
    if (existing?.sourceHash === sourceHash) return;

    const summary = await this.ai.summarizeKnowledge({
      kind: 'CONNECTOR',
      title: connector.name,
      text: text.slice(0, 12000),
    });

    await this.upsertKnowledgeSummary({
      kind: 'CONNECTOR',
      title: connector.name,
      summary,
      sourceHash,
      organizationId: connector.organizationId,
      workspaceId: connector.workspaceId,
      documentId: null,
      connectorId: connector.id,
    });
  }

  private async upsertKnowledgeSummary(input: {
    kind: 'DOCUMENT' | 'WORKSPACE' | 'CONNECTOR';
    title: string;
    summary: string;
    sourceHash: string;
    organizationId: string;
    workspaceId: string;
    documentId: string | null;
    connectorId: string | null;
  }) {
    let id: string;

    if (input.documentId) {
      const row = await this.prisma.knowledgeSummary.upsert({
        where: { documentId: input.documentId },
        create: {
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
        },
        update: {
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
        },
      });
      id = row.id;
    } else if (input.connectorId) {
      const row = await this.prisma.knowledgeSummary.upsert({
        where: { connectorId: input.connectorId },
        create: {
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          connectorId: input.connectorId,
        },
        update: {
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
        },
      });
      id = row.id;
    } else {
      const row = await this.prisma.knowledgeSummary.create({
        data: {
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          sourceHash: input.sourceHash,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
        },
      });
      id = row.id;
    }

    await this.writeEmbedding(id, input.summary);
  }

  private async writeEmbedding(summaryId: string, summary: string) {
    const [embedding] = await this.ai.embed([summary]);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeSummary" SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(',')}]`,
      summaryId,
    );
  }
}
