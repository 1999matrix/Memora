export const AI_CLIENT = Symbol('AI_CLIENT');

export interface TextChunkDraft {
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  pageNumber?: number | null;
  score: number;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChatCitation {
  index: number;
  documentId: string;
  documentName: string;
  chunkId: string;
  pageNumber?: number | null;
  sourceUrl?: string | null;
}

export interface ChatRequest {
  question: string;
  contexts: RetrievedChunk[];
  /** Older conversation compressed into a rolling summary (may be empty). */
  conversationSummary?: string | null;
  /** Only the recent window — never the full thread. */
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface ConversationSummaryRequest {
  previousSummary: string | null;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
}

export interface AiClient {
  extractText(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<string>;

  chunkText(text: string): Promise<TextChunkDraft[]>;

  embed(texts: string[]): Promise<number[][]>;

  rerank(
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]>;

  /**
   * Yields answer tokens. Stub yields a full fake answer in a few chunks.
   * Replace with real streaming LLM later.
   */
  chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown>;

  /**
   * Compress older turns into a rolling summary for multi-turn memory.
   * Stub returns a deterministic digest — replace with a real summarizer LLM.
   */
  summarizeConversation(
    request: ConversationSummaryRequest,
  ): Promise<string>;
}
