import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        success: true,
        status: 'healthy hun hmesha',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        success: false,
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }
}