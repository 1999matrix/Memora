import type { RetrievalEvalJudgeRequest, RetrievalEvalJudgeResult } from './ai-client.interface';

/** Heuristic judge when no LLM is available (stub provider). */
export function heuristicRetrievalJudge(
  request: RetrievalEvalJudgeRequest,
): RetrievalEvalJudgeResult {
  const blob = request.retrievedContext.toLowerCase();
  const hasContext = blob.trim().length > 20;

  const answerRelevance = request.expectedAnswerHints.some((h) =>
    blob.includes(h.toLowerCase()),
  )
    ? 1
    : hasContext
      ? 0.35
      : 0.1;

  const faithfulness = hasContext ? 0.75 : 0.15;

  return { answerRelevance, faithfulness };
}
