import { Logger } from '../../lib/logger.js';
import type { AppConfigService } from '../../lib/config.js';
import {
  AiClient,
  ChatRequest,
  RetrievalEvalJudgeRequest,
  RetrievalEvalJudgeResult,
  RetrievedChunk,
  TextChunkDraft,
} from './ai-client.interface.js';
import { heuristicRetrievalJudge } from './retrieval-eval.util.js';
import { lexicalRerank } from './llm-rerank.util.js';export class HttpAiClient implements AiClient {
  private readonly logger = new Logger(HttpAiClient.name);
  private readonly baseUrl: string;

  constructor(config: AppConfigService) {
    const url = config.get<string>('ai.serviceUrl')?.replace(/\/$/, '');
    if (!url) {
      throw new Error('HttpAiClient requires ai.serviceUrl');
    }
    this.baseUrl = url;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI service ${path} failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async extractText(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<string> {
    const data = await this.postJson<{ text: string }>('/v1/extract', {
      filename: input.filename,
      mime_type: input.mimeType,
      content_base64: input.buffer.toString('base64'),
    });
    return data.text;
  }

  async chunkText(text: string): Promise<TextChunkDraft[]> {
    const data = await this.postJson<{ chunks: TextChunkDraft[] }>(
      '/v1/chunk',
      { text },
    );
    return data.chunks;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const data = await this.postJson<{ embeddings: number[][] }>(
      '/v1/embed',
      { texts },
    );
    return data.embeddings;
  }

  async rerank(
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    return lexicalRerank(query, chunks);
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const res = await fetch(`${this.baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: request.question,
        contexts: request.contexts,
        history: request.history,
        conversation_summary: request.conversationSummary,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`AI chat stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const block of parts) {
        const line = block.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim()) as {
            type?: string;
            content?: string;
          };
          if (payload.type === 'token' && payload.content) {
            yield payload.content;
          }
        } catch {
          this.logger.warn('Skipped malformed SSE chunk from AI service');
        }
      }
    }
  }

  async summarizeConversation(request: {
    previousSummary: string | null;
    messages: { role: string; content: string }[];
  }): Promise<string> {
    const question = 'Summarize the conversation for future context.';
    let out = '';
    for await (const t of this.chatStream({
      question,
      contexts: [],
      history: request.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      conversationSummary: request.previousSummary,
    })) {
      out += t;
    }
    return out.slice(0, 1500);
  }

  async summarizeKnowledge(request: {
    kind: string;
    title: string;
    text: string;
  }): Promise<string> {
    let out = '';
    for await (const t of this.chatStream({
      question: `Summarize this ${request.kind} titled "${request.title}"`,
      contexts: [
        {
          chunkId: 'summary',
          documentId: 'summary',
          documentName: request.title,
          content: request.text.slice(0, 8000),
          score: 1,
        },
      ],
      history: [],
      conversationSummary: null,
    })) {
      out += t;
    }
    return out.slice(0, 1200);
  }

  async judgeRetrievalContext(
    request: RetrievalEvalJudgeRequest,
  ): Promise<RetrievalEvalJudgeResult> {
    return heuristicRetrievalJudge(request);
  }
}
