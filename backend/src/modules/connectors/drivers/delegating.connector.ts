import { Logger } from '@nestjs/common';

import { ConnectorType } from '../../../generated/prisma/client';
import { Connector, ConnectorContext } from '../connector.interface';
import { hasLiveConnectorConfig } from '../connector-credentials.util';
import { LIVE_CONNECTOR_DRIVERS, LiveConnectorBase } from './live-connector.drivers';
import { StubConnectorDriver } from './stub-connector.driver';

/**
 * Uses live API drivers when config includes credentials; otherwise demo stub.
 */
export class DelegatingConnectorDriver implements Connector {
  private readonly logger = new Logger(DelegatingConnectorDriver.name);
  private readonly stub: StubConnectorDriver;
  private readonly live: LiveConnectorBase | undefined;

  constructor(readonly type: ConnectorType) {
    this.stub = new StubConnectorDriver(
      type as ConstructorParameters<typeof StubConnectorDriver>[0],
    );
    this.live = LIVE_CONNECTOR_DRIVERS.find((d) => d.type === type);
  }

  private pick(ctx: ConnectorContext): Connector {
    if (hasLiveConnectorConfig(this.type, ctx.config) && this.live) {
      return this.live;
    }
    return this.stub;
  }

  async connect(ctx: ConnectorContext): Promise<void> {
    const driver = this.pick(ctx);
    if (driver === this.stub) {
      this.logger.debug(`${this.type}: demo/stub connect`);
    }
    return driver.connect(ctx);
  }

  async disconnect(ctx: ConnectorContext): Promise<void> {
    return this.pick(ctx).disconnect(ctx);
  }

  async testConnection(ctx: ConnectorContext): Promise<boolean> {
    return this.pick(ctx).testConnection(ctx);
  }

  async sync(ctx: ConnectorContext) {
    const driver = this.pick(ctx);
    if (driver === this.stub) {
      this.logger.debug(`${this.type}: demo/stub sync`);
    }
    return driver.sync(ctx);
  }
}
