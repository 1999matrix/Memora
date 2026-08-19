import { Global, Module } from '@nestjs/common';

import { AI_CLIENT } from './ai-client.interface';
import { StubAiClient } from './stub-ai.client';

@Global()
@Module({
  providers: [
    StubAiClient,
    { provide: AI_CLIENT, useExisting: StubAiClient },
  ],
  exports: [AI_CLIENT, StubAiClient],
})
export class AiModule {}
