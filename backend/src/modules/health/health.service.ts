import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async check() {
    return this.ready();
  }

  async ready() {
    const checks: {
      database: 'up' | 'down';
      redis: 'up' | 'down';
    } = {
      database: 'down',
      redis: 'down',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }

    const healthy = checks.database === 'up' && checks.redis === 'up';

    if (!healthy) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
