import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_CLIENT } from './ai-client.interface';
import { resolveAiProvider } from './ai-provider';
import { OpenAiAiClient } from './openai-ai.client';
import { StubAiClient } from './stub-ai.client';

@Global()
@Module({
  providers: [
    StubAiClient,
    OpenAiAiClient,
    {
      provide: AI_CLIENT,
      useFactory: (
        config: ConfigService,
        stub: StubAiClient,
        openai: OpenAiAiClient,
      ) => {
        const kind = resolveAiProvider(config.get<string>('ai.provider'));
        return kind === 'openai' ? openai : stub;
      },
      inject: [ConfigService, StubAiClient, OpenAiAiClient],
    },
  ],
  exports: [AI_CLIENT, StubAiClient, OpenAiAiClient],
})
export class AiModule {}
