import { Global, Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';
import { UsageService } from './usage.service';

@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [UsageService],
  exports: [UsageService],
})
export class AnalyticsModule {}
