import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { CONNECTOR_SYNC_QUEUE } from '../../common/constants/rag.constants';
import { MembershipService } from '../../common/services/membership.service';
import { WorkspaceRole } from '../../common/enums/workspace-role.enum';
import { ConnectorType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorSyncJobData } from './connector-sync.service';
import {
  CreateConnectorDto,
  UpdateConnectorDto,
} from './dto/connector.dto';

@Injectable()
export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly registry: ConnectorRegistry,
    @InjectQueue(CONNECTOR_SYNC_QUEUE)
    private readonly syncQueue: Queue<ConnectorSyncJobData>,
  ) {}

  listTypes() {
    return this.registry.listTypes();
  }

  async create(userId: string, workspaceId: string, dto: CreateConnectorDto) {
    const membership = await this.membership.assertWorkspaceRole(
      userId,
      workspaceId,
      [WorkspaceRole.ADMIN],
    );

    if (!this.registry.listTypes().includes(dto.type as ConnectorType)) {
      throw new BadRequestException(`Unsupported connector type: ${dto.type}`);
    }

    const type = dto.type as ConnectorType;

    const connector = await this.prisma.connector.create({
      data: {
        name: dto.name,
        type,
        config: (dto.config || {}) as object,
        status: 'DISCONNECTED',
        organizationId: membership.workspace.organizationId,
        workspaceId,
        createdById: userId,
      },
    });

    const driver = this.registry.get(type);
    await driver.connect({
      connectorId: connector.id,
      workspaceId,
      organizationId: membership.workspace.organizationId,
      config: (dto.config || {}) as Record<string, unknown>,
      syncCursor: null,
    });

    return this.prisma.connector.update({
      where: { id: connector.id },
      data: { status: 'CONNECTED' },
    });
  }

  async findAll(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.connector.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { syncItems: true, documents: true } },
      },
    });
  }

  async findOne(userId: string, connectorId: string) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: {
        _count: { select: { syncItems: true, documents: true } },
        syncItems: {
          where: { deletedAt: null },
          take: 20,
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!connector) {
      throw new NotFoundException('Connector not found');
    }
    await this.membership.assertWorkspaceMember(userId, connector.workspaceId);
    return connector;
  }

  async update(userId: string, connectorId: string, dto: UpdateConnectorDto) {
    const connector = await this.findOne(userId, connectorId);
    await this.membership.assertWorkspaceRole(userId, connector.workspaceId, [
      WorkspaceRole.ADMIN,
    ]);

    return this.prisma.connector.update({
      where: { id: connectorId },
      data: {
        name: dto.name,
        config: dto.config !== undefined ? (dto.config as object) : undefined,
      },
    });
  }

  async remove(userId: string, connectorId: string) {
    const connector = await this.findOne(userId, connectorId);
    await this.membership.assertWorkspaceRole(userId, connector.workspaceId, [
      WorkspaceRole.ADMIN,
    ]);

    const driver = this.registry.get(connector.type);
    await driver.disconnect({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
      organizationId: connector.organizationId,
      config: (connector.config as Record<string, unknown>) || {},
      syncCursor: connector.syncCursor,
    });

    await this.prisma.connector.delete({ where: { id: connectorId } });
    return { success: true };
  }

  async testConnection(userId: string, connectorId: string) {
    const connector = await this.findOne(userId, connectorId);
    const driver = this.registry.get(connector.type);
    const ok = await driver.testConnection({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
      organizationId: connector.organizationId,
      config: (connector.config as Record<string, unknown>) || {},
      syncCursor: connector.syncCursor,
    });
    return { ok };
  }

  async enqueueSync(userId: string, connectorId: string) {
    const connector = await this.findOne(userId, connectorId);
    await this.membership.assertWorkspaceRole(userId, connector.workspaceId, [
      WorkspaceRole.ADMIN,
    ]);

    const job = await this.syncQueue.add(
      'sync',
      { connectorId },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
      },
    );

    return { jobId: job.id, connectorId, status: 'queued' };
  }
}
