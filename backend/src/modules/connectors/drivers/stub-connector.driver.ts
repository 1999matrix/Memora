import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

import {
  Connector,
  ConnectorContext,
  ConnectorRemoteItem,
} from '../connector.interface';

type DriverType =
  | 'GOOGLE_DRIVE'
  | 'GITHUB'
  | 'NOTION'
  | 'CONFLUENCE'
  | 'JIRA'
  | 'SLACK'
  | 'SHAREPOINT'
  | 'POSTGRESQL';

/**
 * Stub drivers for all PRD connector types.
 * Replace per-type methods with real API clients when ready.
 */
@Injectable()
export class StubConnectorDriver implements Connector {
  private readonly logger = new Logger(StubConnectorDriver.name);

  constructor(readonly type: DriverType) {}

  async connect(ctx: ConnectorContext): Promise<void> {
    this.logger.warn(`STUB connect ${this.type} connector=${ctx.connectorId}`);
  }

  async disconnect(ctx: ConnectorContext): Promise<void> {
    this.logger.warn(
      `STUB disconnect ${this.type} connector=${ctx.connectorId}`,
    );
  }

  async testConnection(ctx: ConnectorContext): Promise<boolean> {
    this.logger.warn(
      `STUB testConnection ${this.type} connector=${ctx.connectorId}`,
    );
    return true;
  }

  async sync(ctx: ConnectorContext): Promise<{
    items: ConnectorRemoteItem[];
    deletedExternalIds: string[];
    nextCursor: string | null;
  }> {
    this.logger.warn(`STUB sync ${this.type} connector=${ctx.connectorId}`);

    const seed =
      (typeof ctx.config.seed === 'string' && ctx.config.seed) ||
      ctx.connectorId;
    const stamp = ctx.syncCursor || 'v1';

    const items: ConnectorRemoteItem[] = [1, 2, 3].map((n) => {
      const externalId = `${this.type.toLowerCase()}-${seed}-item-${n}`;
      const content = [
        `Stub ${this.type} document #${n}`,
        `Connector: ${ctx.connectorId}`,
        `Workspace: ${ctx.workspaceId}`,
        `Cursor: ${stamp}`,
        `Knowledge sample: item ${n} describes Memora connector sync for ${this.type}.`,
      ].join('\n');

      return {
        externalId,
        name: `${this.type}-item-${n}.txt`,
        content,
        mimeType: 'text/plain',
        externalUpdatedAt: new Date(),
        metadata: {
          stub: true,
          type: this.type,
          hash: createHash('sha256').update(content).digest('hex'),
        },
      };
    });

    // Second sync with same cursor returns same contentHashes → incremental skip.
    // Bumping cursor simulates remote change for item 1 only.
    return {
      items,
      deletedExternalIds: [],
      nextCursor: `stub-${Date.now()}`,
    };
  }
}
