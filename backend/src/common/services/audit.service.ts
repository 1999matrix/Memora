import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    userId?: string;
    organizationId?: string;
    workspaceId?: string;
    ip?: string;
    userAgent?: string;
    correlationId?: string;
    metadata?: object;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        userId: input.userId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: input.metadata as object | undefined,
      },
    });
  }
}
