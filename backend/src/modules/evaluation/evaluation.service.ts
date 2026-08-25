import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { RetrievalService } from '../retrieval/retrieval.service';

type GoldenCase = {
  id: string;
  question: string;
  expectedSourceHints: string[];
  expectedAnswerHints: string[];
};

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
  ) {}

  private loadDataset(): GoldenCase[] {
    const path = join(__dirname, 'golden-dataset.json');
    return JSON.parse(readFileSync(path, 'utf8')) as GoldenCase[];
  }

  /**
   * Runs retrieval-focused eval against the golden set.
   * Answer relevance / faithfulness are stub heuristics until real LLM judges land.
   */
  async run(input: {
    userId: string;
    workspaceId: string;
    topK?: number;
    createdById?: string;
  }) {
    const dataset = this.loadDataset();
    const topK = input.topK ?? 5;
    const details: object[] = [];

    let recallSum = 0;
    let precisionSum = 0;
    let mrrSum = 0;
    let citationSum = 0;
    let relevanceSum = 0;
    let faithfulnessSum = 0;
    let latencySum = 0;

    for (const item of dataset) {
      const started = Date.now();
      const hits = await this.retrieval.search(
        input.userId,
        input.workspaceId,
        item.question,
        topK,
      );
      const latencyMs = Date.now() - started;
      latencySum += latencyMs;

      const blob = hits.map((h) => h.content + ' ' + h.documentName).join('\n');
      const relevantFlags = hits.map((h) =>
        item.expectedSourceHints.some((hint) =>
          (h.content + h.documentName)
            .toLowerCase()
            .includes(hint.toLowerCase()),
        ),
      );

      const relevantCount = relevantFlags.filter(Boolean).length;
      const recall = relevantCount > 0 ? 1 : 0;
      const precision = hits.length ? relevantCount / hits.length : 0;
      const firstRelevant = relevantFlags.findIndex(Boolean);
      const mrr = firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0;

      const citationAccuracy = item.expectedSourceHints.every((hint) =>
        blob.toLowerCase().includes(hint.toLowerCase()),
      )
        ? 1
        : relevantCount / Math.max(item.expectedSourceHints.length, 1);

      // Stub LLM-as-judge stand-ins
      const answerRelevance = item.expectedAnswerHints.some((h) =>
        blob.toLowerCase().includes(h.toLowerCase()),
      )
        ? 1
        : 0.3;
      const faithfulness = relevantCount > 0 ? 0.8 : 0.2;

      recallSum += recall;
      precisionSum += precision;
      mrrSum += mrr;
      citationSum += citationAccuracy;
      relevanceSum += answerRelevance;
      faithfulnessSum += faithfulness;

      details.push({
        id: item.id,
        question: item.question,
        latencyMs,
        recall,
        precision,
        mrr,
        citationAccuracy,
        answerRelevance,
        faithfulness,
        hitCount: hits.length,
      });
    }

    const n = dataset.length || 1;
    const metrics = {
      recallAtK: recallSum / n,
      precisionAtK: precisionSum / n,
      mrr: mrrSum / n,
      citationAccuracy: citationSum / n,
      answerRelevance: relevanceSum / n,
      faithfulness: faithfulnessSum / n,
      averageLatencyMs: latencySum / n,
      tokenCost: 0,
      topK,
      cases: n,
    };

    const run = await this.prisma.evaluationRun.create({
      data: {
        name: `golden-${new Date().toISOString()}`,
        datasetVersion: 'v1',
        metrics: metrics as object,
        details: details as object[],
        createdById: input.createdById,
      },
    });

    return { runId: run.id, metrics, details };
  }

  listRuns() {
    return this.prisma.evaluationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
