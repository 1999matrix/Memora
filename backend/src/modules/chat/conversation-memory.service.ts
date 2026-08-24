import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AI_CLIENT,
  type AiClient,
} from '../../ai/ai-client.interface';
import {
  RECENT_MESSAGE_LIMIT,
  SUMMARY_REFRESH_EVERY,
} from '../../common/constants/rag.constants';
import { PrismaService } from '../../prisma';

export type MemoryBundle = {
  conversationSummary: string | null;
  recentHistory: { role: 'user' | 'assistant'; content: string }[];
  totalMessages: number;
  summarizedThrough: number;
};

@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
  ) {}

  /**
   * Builds prompt memory: rolling summary + recent window only.
   */
  async buildMemory(conversationId: string): Promise<MemoryBundle> {
    const [totalMessages, summaryRow, recent] = await Promise.all([
      this.prisma.message.count({ where: { conversationId } }),
      this.prisma.conversationSummary.findUnique({
        where: { conversationId },
      }),
      this.prisma.message.findMany({
        where: {
          conversationId,
          role: { in: ['USER', 'ASSISTANT'] },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_MESSAGE_LIMIT,
      }),
    ]);

    const recentHistory = recent
      .reverse()
      .map((m) => ({
        role: (m.role === 'USER' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: m.content,
      }));

    return {
      conversationSummary: summaryRow?.summary ?? null,
      recentHistory,
      totalMessages,
      summarizedThrough: summaryRow?.messageCountAtSummary ?? 0,
    };
  }

  shouldRefreshSummary(totalMessages: number, summarizedThrough: number) {
    return totalMessages - summarizedThrough >= SUMMARY_REFRESH_EVERY;
  }

  async refreshSummary(conversationId: string): Promise<void> {
    const existing = await this.prisma.conversationSummary.findUnique({
      where: { conversationId },
    });

    const covered = existing?.messageCountAtSummary ?? 0;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        role: { in: ['USER', 'ASSISTANT', 'SYSTEM'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Summarize everything except the trailing recent window (kept verbatim).
    const cutoff = Math.max(0, messages.length - RECENT_MESSAGE_LIMIT);
    const toSummarize = messages.slice(0, cutoff);

    if (toSummarize.length === 0) {
      this.logger.debug(
        `Skip summary for ${conversationId} — not enough older messages`,
      );
      return;
    }

    // Only refresh when we have new older material since last summary.
    if (toSummarize.length <= covered) {
      return;
    }

    const summary = await this.ai.summarizeConversation({
      previousSummary: existing?.summary ?? null,
      messages: toSummarize.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    });

    await this.prisma.conversationSummary.upsert({
      where: { conversationId },
      create: {
        conversationId,
        summary,
        messageCountAtSummary: toSummarize.length,
      },
      update: {
        summary,
        messageCountAtSummary: toSummarize.length,
      },
    });
  }
}
