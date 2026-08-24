import { Module } from '@nestjs/common';

import { QueuesModule } from '../queues/queues.module';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorSyncProcessor } from './connector-sync.processor';
import { ConnectorSyncService } from './connector-sync.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';

@Module({
  imports: [QueuesModule],
  controllers: [ConnectorsController],
  providers: [
    ConnectorRegistry,
    ConnectorSyncService,
    ConnectorSyncProcessor,
    ConnectorsService,
  ],
  exports: [ConnectorRegistry, ConnectorSyncService],
})
export class ConnectorsModule {}
