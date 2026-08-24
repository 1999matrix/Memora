import { createHash } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { DOCUMENT_QUEUE } from '../../common/constants/rag.constants';
import { PrismaService } from '../../prisma';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.interface';
import { DocumentJobData } from '../queues/document.processor';
import { ConnectorRegistry } from './connector.registry';

export type ConnectorSyncJobData = { connectorId: string };

@Injectable()
export class ConnectorSyncService {
  private readonly logger = new Logger(ConnectorSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @InjectQueue(DOCUMENT_QUEUE)
    private readonly documentQueue: Queue<DocumentJobData>,
  ) {}

  async syncConnector(connectorId: string): Promise<{
    created: number;
    updated: number;
    skipped: number;
    deleted: number;
  }> {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) {
      this.logger.warn(`Connector ${connectorId} not found`);
      return { created: 0, updated: 0, skipped: 0, deleted: 0 };
    }

    await this.prisma.connector.update({
      where: { id: connectorId },
      data: { status: 'SYNCING', lastError: null },
    });

    const stats = { created: 0, updated: 0, skipped: 0, deleted: 0 };

    try {
      const driver = this.registry.get(connector.type);
      const ctx = {
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        organizationId: connector.organizationId,
        config: (connector.config as Record<string, unknown>) || {},
        syncCursor: connector.syncCursor,
      };

      const result = await driver.sync(ctx);

      for (const item of result.items) {
        const contentHash = createHash('sha256')
          .update(item.content)
          .digest('hex');

        const existing = await this.prisma.connectorSyncItem.findUnique({
          where: {
            connectorId_externalId: {
              connectorId,
              externalId: item.externalId,
            },
          },
        });

        // Incremental: unchanged content → skip re-index
        if (existing?.contentHash === contentHash && existing.documentId) {
          await this.prisma.connectorSyncItem.update({
            where: { id: existing.id },
            data: {
              lastSyncedAt: new Date(),
              externalUpdatedAt: item.externalUpdatedAt,
              deletedAt: null,
            },
          });
          stats.skipped += 1;
          continue;
        }

        const buffer = Buffer.from(item.content, 'utf8');
        const stored = await this.storage.save(
          connector.workspaceId,
          item.name,
          buffer,
        );

        let documentId = existing?.documentId ?? null;

        if (documentId) {
          await this.prisma.document.update({
            where: { id: documentId },
            data: {
              name: item.name,
              mimeType: item.mimeType || 'text/plain',
              sizeBytes: buffer.length,
              storageKey: stored.key,
              status: 'PENDING',
              contentHash,
              externalId: item.externalId,
              connectorId,
              metadata: {
                connectorType: connector.type,
                ...(item.metadata || {}),
              } as object,
              errorMessage: null,
            },
          });
          stats.updated += 1;
        } else {
          const doc = await this.prisma.document.create({
            data: {
              name: item.name,
              mimeType: item.mimeType || 'text/plain',
              sizeBytes: buffer.length,
              storageKey: stored.key,
              status: 'PENDING',
              organizationId: connector.organizationId,
              workspaceId: connector.workspaceId,
              uploadedById: connector.createdById,
              connectorId,
              externalId: item.externalId,
              contentHash,
              metadata: {
                connectorType: connector.type,
                ...(item.metadata || {}),
              } as object,
            },
          });
          documentId = doc.id;
          stats.created += 1;
        }

        await this.prisma.connectorSyncItem.upsert({
          where: {
            connectorId_externalId: {
              connectorId,
              externalId: item.externalId,
            },
          },
          create: {
            connectorId,
            documentId,
            externalId: item.externalId,
            externalUpdatedAt: item.externalUpdatedAt,
            contentHash,
            lastSyncedAt: new Date(),
            metadata: (item.metadata || {}) as object,
          },
          update: {
            documentId,
            externalUpdatedAt: item.externalUpdatedAt,
            contentHash,
            lastSyncedAt: new Date(),
            deletedAt: null,
            metadata: (item.metadata || {}) as object,
          },
        });

        await this.documentQueue.add(
          'process',
          { documentId },
          {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );
      }

      for (const externalId of result.deletedExternalIds) {
        const existing = await this.prisma.connectorSyncItem.findUnique({
          where: {
            connectorId_externalId: { connectorId, externalId },
          },
        });
        if (!existing) continue;

        if (existing.documentId) {
          await this.prisma.document.delete({
            where: { id: existing.documentId },
          });
        }

        await this.prisma.connectorSyncItem.update({
          where: { id: existing.id },
          data: {
            deletedAt: new Date(),
            documentId: null,
            lastSyncedAt: new Date(),
          },
        });
        stats.deleted += 1;
      }

      await this.prisma.connector.update({
        where: { id: connectorId },
        data: {
          status: 'CONNECTED',
          lastSyncedAt: new Date(),
          syncCursor: result.nextCursor,
          lastError: null,
        },
      });

      return stats;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Connector sync failed';
      await this.prisma.connector.update({
        where: { id: connectorId },
        data: { status: 'ERROR', lastError: message },
      });
      throw error;
    }
  }
}
