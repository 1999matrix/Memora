import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  CONNECTOR_SYNC_QUEUE,
  DOCUMENT_QUEUE,
  SUMMARY_QUEUE,
} from '../../common/constants/rag.constants';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentProcessor } from './document.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,
          maxRetriesPerRequest: null,
          // ponytail: in dev, do not reconnect. A missing Redis would otherwise retry forever and bury the startup log.
          // Production keeps reconnecting. Upgrade path: always reconnect and log once.
          retryStrategy: (times: number) => {
            if (process.env.NODE_ENV !== 'production') return null;
            return Math.min(times * 1000, 10_000);
          },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: DOCUMENT_QUEUE },
      { name: CONNECTOR_SYNC_QUEUE },
      { name: SUMMARY_QUEUE },
    ),
  ],
  providers: [DocumentProcessingService, DocumentProcessor],
  exports: [BullModule, DocumentProcessingService],
})
export class QueuesModule {}
