import { Inject, Injectable } from '@nestjs/common';

import {
  AI_CLIENT,
  type AiClient,
  type RetrievedChunk,
} from '../../ai/ai-client.interface';
import { MembershipService } from '../../common/services/membership.service';
import { PrismaService } from '../../prisma';

type Hit = {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  documentName: string;
  score: number;
};

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
  ) {}

  async search(
    userId: string,
    workspaceId: string,
    query: string,
    topK = 8,
  ): Promise<RetrievedChunk[]> {
    await this.membership.assertWorkspaceMember(userId, workspaceId);

    const [queryEmbedding] = await this.ai.embed([query]);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    const vectorHits = await this.prisma.$queryRawUnsafe<Hit[]>(
      `
      SELECT
        c.id,
        c."documentId",
        c.content,
        c."pageNumber",
        d.name AS "documentName",
        (1 - (c.embedding <=> $1::vector))::float AS score
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE c."workspaceId" = $2
        AND d.status = 'READY'
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      vectorLiteral,
      workspaceId,
      topK,
    );

    const lexicalHits = await this.prisma.$queryRawUnsafe<Hit[]>(
      `
      SELECT
        c.id,
        c."documentId",
        c.content,
        c."pageNumber",
        d.name AS "documentName",
        ts_rank(
          to_tsvector('english', c.content),
          plainto_tsquery('english', $1)
        )::float AS score
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE c."workspaceId" = $2
        AND d.status = 'READY'
        AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
      ORDER BY score DESC
      LIMIT $3
      `,
      query,
      workspaceId,
      topK,
    );

    const fused = this.reciprocalRankFusion(
      vectorHits ?? [],
      lexicalHits ?? [],
      topK * 2,
    );

    const mapped: RetrievedChunk[] = fused.map((h) => ({
      chunkId: h.id,
      documentId: h.documentId,
      documentName: h.documentName,
      content: h.content,
      pageNumber: h.pageNumber,
      score: Number(h.score),
      sourceUrl: null,
      metadata: { stubPipeline: true },
    }));

    return this.ai.rerank(query, mapped);
  }

  private reciprocalRankFusion(
    vectorHits: Hit[],
    lexicalHits: Hit[],
    limit: number,
  ): Hit[] {
    const k = 60;
    const scores = new Map<string, { hit: Hit; score: number }>();

    const add = (hit: Hit, rank: number) => {
      const current = scores.get(hit.id) ?? { hit, score: 0 };
      current.score += 1 / (k + rank + 1);
      current.hit = { ...hit, score: current.score };
      scores.set(hit.id, current);
    };

    vectorHits.forEach((hit, rank) => add(hit, rank));
    lexicalHits.forEach((hit, rank) => add(hit, rank));

    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => ({ ...x.hit, score: x.score }));
  }
}
