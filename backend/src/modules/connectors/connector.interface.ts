export type ConnectorRemoteItem = {
  externalId: string;
  name: string;
  content: string;
  mimeType?: string;
  externalUpdatedAt?: Date;
  metadata?: Record<string, unknown>;
};

export type ConnectorContext = {
  connectorId: string;
  workspaceId: string;
  organizationId: string;
  config: Record<string, unknown>;
  syncCursor: string | null;
};

/**
 * PRD connector contract. Implementations may be stubs until real OAuth/APIs are wired.
 */
export interface Connector {
  readonly type: string;

  connect(ctx: ConnectorContext): Promise<void>;
  disconnect(ctx: ConnectorContext): Promise<void>;
  testConnection(ctx: ConnectorContext): Promise<boolean>;

  /**
   * Returns changed remote items since cursor (incremental).
   * Deleted items are reported via deletedExternalIds.
   */
  sync(ctx: ConnectorContext): Promise<{
    items: ConnectorRemoteItem[];
    deletedExternalIds: string[];
    nextCursor: string | null;
  }>;
}
