import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  AI_CLIENT,
  type AiClient,
  type ChatCitation,
} from '../../ai/ai-client.interface';
import { SUMMARY_QUEUE } from '../../common/constants/rag.constants';
import { MembershipService } from '../../common/services/membership.service';
import { PrismaService } from '../../prisma';
import { RetrievalService } from '../retrieval/retrieval.service';
import { ConversationMemoryService } from './conversation-memory.service';
import type { KnowledgeSummaryJobData } from '../summaries/knowledge-summary.service';
import { UsageService } from '../analytics/usage.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly retrieval: RetrievalService,
    private readonly memory: ConversationMemoryService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
    @InjectQueue(SUMMARY_QUEUE)
    private readonly summaryQueue: Queue<KnowledgeSummaryJobData>,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
  ) {}

  async listConversations(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.conversation.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        summary: true,
      },
    });
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        summary: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.membership.assertWorkspaceMember(
      userId,
      conversation.workspaceId,
    );

    if (conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async getMemory(userId: string, conversationId: string) {
    await this.getConversation(userId, conversationId);
    return this.memory.buildMemory(conversationId);
  }

  async deleteConversation(userId: string, conversationId: string) {
    await this.getConversation(userId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { success: true };
  }

  async *streamChat(
    userId: string,
    workspaceId: string,
    message: string,
    conversationId?: string,
  ): AsyncGenerator<
    | {
        type: 'meta';
        conversationId: string;
        citations: ChatCitation[];
        memory: {
          hasSummary: boolean;
          recentTurns: number;
        };
      }
    | { type: 'token'; content: string }
    | { type: 'done' }
  > {
    const membership = await this.membership.assertWorkspaceMember(
      userId,
      workspaceId,
    );

    let conversation = conversationId
      ? await this.prisma.conversation.findUnique({
          where: { id: conversationId },
        })
      : null;

    if (conversationId && !conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation) {
      await this.membership.assertWorkspaceMember(
        userId,
        conversation.workspaceId,
      );
      if (conversation.userId !== userId) {
        throw new NotFoundException('Conversation not found');
      }
    } else {
      conversation = await this.prisma.conversation.create({
        data: {
          title: message.slice(0, 80),
          organizationId: membership.workspace.organizationId,
          workspaceId,
          userId,
        },
      });
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message,
      },
    });

    const memoryBundle = await this.memory.buildMemory(conversation.id);

    const contexts = await this.retrieval.search(
      userId,
      workspaceId,
      message,
      6,
    );

    const citations: ChatCitation[] = contexts.slice(0, 5).map((c, index) => ({
      index: index + 1,
      documentId: c.documentId,
      documentName: c.documentName,
      chunkId: c.chunkId,
      pageNumber: c.pageNumber,
      sourceUrl: c.sourceUrl,
    }));

    yield {
      type: 'meta',
      conversationId: conversation.id,
      citations,
      memory: {
        hasSummary: Boolean(memoryBundle.conversationSummary),
        recentTurns: memoryBundle.recentHistory.length,
      },
    };

    let full = '';
    const chatStarted = Date.now();
    for await (const token of this.ai.chatStream({
      question: message,
      contexts,
      conversationSummary: memoryBundle.conversationSummary,
      history: memoryBundle.recentHistory,
    })) {
      full += token;
      yield { type: 'token', content: token };
    }

    const durationMs = Date.now() - chatStarted;
    // Stub token accounting until real provider usage is wired.
    const approxIn = Math.ceil(message.length / 4) + contexts.length * 200;
    const approxOut = Math.ceil(full.length / 4);
    await this.usage.track({
      provider: 'stub',
      model: 'stub-chat',
      operation: 'chatStream',
      inputTokens: approxIn,
      outputTokens: approxOut,
      estimatedCostUsd: (approxIn + approxOut) * 0.0000002,
      requestDurationMs: durationMs,
      userId,
      organizationId: conversation.organizationId,
      workspaceId,
      conversationId: conversation.id,
    });

    await this.audit.log({
      action: 'chat.message',
      resourceType: 'conversation',
      resourceId: conversation.id,
      userId,
      organizationId: conversation.organizationId,
      workspaceId,
      metadata: { citations: citations.length, durationMs },
    });

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: full,
        citations: citations as object[],
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    const totalAfter = memoryBundle.totalMessages + 1; /* assistant just written */
    if (
      this.memory.shouldRefreshSummary(
        totalAfter,
        memoryBundle.summarizedThrough,
      )
    ) {
      await this.summaryQueue.add(
        'refresh',
        { kind: 'CONVERSATION', conversationId: conversation.id },
        {
          removeOnComplete: 50,
          removeOnFail: 20,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    }

    yield { type: 'done' };
  }
}
