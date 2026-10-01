import { applyRerankScores, lexicalRerank } from './llm-rerank.util';
import type { RetrievedChunk } from './ai-client.interface';

const chunk = (id: string, content: string, score: number): RetrievedChunk => ({
  chunkId: id,
  documentId: 'd1',
  documentName: 'doc',
  content,
  score,
});

describe('llm-rerank.util', () => {
  it('lexicalRerank boosts chunks matching query terms', () => {
    const chunks = [
      chunk('a', 'unrelated text', 0.9),
      chunk('b', 'Memora PTO policy details', 0.5),
    ];
    const out = lexicalRerank('Memora PTO', chunks);
    expect(out[0].chunkId).toBe('b');
  });

  it('applyRerankScores reorders by model scores', () => {
    const chunks = [chunk('a', 'a', 1), chunk('b', 'b', 1)];
    const out = applyRerankScores(chunks, [
      { index: 0, score: 0.2 },
      { index: 1, score: 0.9 },
    ]);
    expect(out[0].chunkId).toBe('b');
  });
});
