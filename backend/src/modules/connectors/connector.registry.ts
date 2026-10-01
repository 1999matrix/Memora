import { Injectable } from '@nestjs/common';

import { ConnectorType } from '../../generated/prisma/client';
import { Connector } from './connector.interface';
import { DelegatingConnectorDriver } from './drivers/delegating.connector';

@Injectable()
export class ConnectorRegistry {
  private readonly drivers = new Map<ConnectorType, Connector>();

  constructor() {
    for (const type of Object.values(ConnectorType)) {
      this.drivers.set(type, new DelegatingConnectorDriver(type));
    }
  }

  get(type: ConnectorType): Connector {
    const driver = this.drivers.get(type);
    if (!driver) {
      throw new Error(`No connector driver registered for ${type}`);
    }
    return driver;
  }

  listTypes(): ConnectorType[] {
    return [...this.drivers.keys()];
  }
}
