import { Module } from '@nestjs/common';

import { RetrievalModule } from '../retrieval/retrieval.module';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';

@Module({
  imports: [RetrievalModule],
  controllers: [EvaluationController],
  providers: [EvaluationService],
})
export class EvaluationModule {}
