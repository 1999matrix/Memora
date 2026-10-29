import type { RetrievedChunk } from './ai-client.interface';

export function lexicalRerank(
  query: string,
  chunks: RetrievedChunk[],
): RetrievedChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);

  const scoreChunk = (c: RetrievedChunk) => {
    const text = `${c.documentName} ${c.content}`.toLowerCase();
    const termHits = terms.reduce(
      (n, t) => n + (text.includes(t) ? 1 : 0),
      0,
    );
    return termHits * 10 + c.score;
  };

  return [...chunks].sort((a, b) => scoreChunk(b) - scoreChunk(a));
}

export function applyRerankScores(
  chunks: RetrievedChunk[],
  scores: { index: number; score: number }[],
): RetrievedChunk[] {
  const byIndex = new Map(scores.map((s) => [s.index, s.score]));
  const ranked = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: byIndex.get(index) ?? chunk.score,
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.map(({ chunk, score }) => ({ ...chunk, score }));
}

export function parseRerankScoresJson(
  raw: string,
  maxIndex: number,
): { index: number; score: number }[] {
  const parsed = JSON.parse(raw) as {
    scores?: { index: number; score: number }[];
  };
  if (!Array.isArray(parsed.scores)) {
    return [];
  }
  return parsed.scores.filter(
    (s) =>
      Number.isFinite(s.index) &&
      s.index >= 0 &&
      s.index < maxIndex &&
      Number.isFinite(s.score),
  );
}
