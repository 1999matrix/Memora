import { Module } from '@nestjs/common';

import { QueuesModule } from '../queues/queues.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationMemoryService } from './conversation-memory.service';

@Module({
  imports: [RetrievalModule, QueuesModule],
  controllers: [ChatController],
  providers: [ChatService, ConversationMemoryService],
  exports: [ConversationMemoryService],
})
export class ChatModule {}
