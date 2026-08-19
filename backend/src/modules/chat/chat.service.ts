import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  AI_CLIENT,
  type AiClient,
  type ChatCitation,
} from '../../ai/ai-client.interface';
import { MembershipService } from '../../common/services/membership.service';
import { PrismaService } from '../../prisma';
import { RetrievalService } from '../retrieval/retrieval.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly retrieval: RetrievalService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
  ) {}

  async listConversations(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.conversation.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
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
    | { type: 'meta'; conversationId: string; citations: ChatCitation[] }
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

    const historyRows = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

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
    };

    let full = '';
    for await (const token of this.ai.chatStream({
      question: message,
      contexts,
      history: historyRows
        .filter((m) => m.role === 'USER' || m.role === 'ASSISTANT')
        .map((m) => ({
          role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        })),
    })) {
      full += token;
      yield { type: 'token', content: token };
    }

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

    yield { type: 'done' };
  }
}
