import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async track(input: {
    provider: string;
    model: string;
    operation: string;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
    requestDurationMs?: number;
    userId?: string;
    organizationId?: string;
    workspaceId?: string;
    conversationId?: string;
    metadata?: object;
  }) {
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    return this.prisma.llmUsageEvent.create({
      data: {
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: input.estimatedCostUsd ?? 0,
        requestDurationMs: input.requestDurationMs ?? 0,
        userId: input.userId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        metadata: input.metadata as object | undefined,
      },
    });
  }

  async costSummary(organizationId?: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const where = {
      createdAt: { gte: since },
      ...(organizationId ? { organizationId } : {}),
    };

    const events = await this.prisma.llmUsageEvent.findMany({ where });

    const dailyCost = new Map<string, number>();
    const byOrg = new Map<string, number>();
    const byUser = new Map<string, number>();
    const byModel = new Map<string, number>();
    let monthlyCost = 0;
    let tokenUsage = 0;

    for (const e of events) {
      monthlyCost += e.estimatedCostUsd;
      tokenUsage += e.totalTokens;
      const day = e.createdAt.toISOString().slice(0, 10);
      dailyCost.set(day, (dailyCost.get(day) || 0) + e.estimatedCostUsd);
      if (e.organizationId) {
        byOrg.set(
          e.organizationId,
          (byOrg.get(e.organizationId) || 0) + e.estimatedCostUsd,
        );
      }
      if (e.userId) {
        byUser.set(e.userId, (byUser.get(e.userId) || 0) + e.estimatedCostUsd);
      }
      byModel.set(e.model, (byModel.get(e.model) || 0) + e.estimatedCostUsd);
    }

    return {
      monthlyCost,
      tokenUsage,
      dailyCost: Object.fromEntries(dailyCost),
      costPerOrganization: Object.fromEntries(byOrg),
      costPerUser: Object.fromEntries(byUser),
      costPerModel: Object.fromEntries(byModel),
    };
  }
}
