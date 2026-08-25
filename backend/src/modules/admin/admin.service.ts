import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { RedisService } from '../../redis/redis.service';
import { UsageService } from '../analytics/usage.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly usage: UsageService,
  ) {}

  async dashboard() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      organizations,
      workspaces,
      documents,
      indexedChunks,
      queries,
      latencyAgg,
      connectors,
      failedConnectors,
      costs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { lastLoginAt: { gte: since } },
      }),
      this.prisma.organization.count(),
      this.prisma.workspace.count(),
      this.prisma.document.count(),
      this.prisma.documentChunk.count(),
      this.prisma.retrievalQueryLog.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.retrievalQueryLog.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { latencyMs: true },
      }),
      this.prisma.connector.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.connector.count({ where: { status: 'ERROR' } }),
      this.usage.costSummary(),
    ]);

    let redisOk = false;
    try {
      redisOk = (await this.redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }

    return {
      totalUsers,
      activeUsers,
      organizations,
      workspaces,
      documents,
      indexedChunks,
      queries24h: queries,
      averageLatencyMs: latencyAgg._avg.latencyMs ?? 0,
      connectorHealth: {
        byStatus: Object.fromEntries(
          connectors.map((c) => [c.status, c._count._all]),
        ),
        failedJobs: failedConnectors,
      },
      redisOk,
      costs,
    };
  }
}
