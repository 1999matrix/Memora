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
