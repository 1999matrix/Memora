import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';

import {
  AiClient,
  ChatRequest,
  ConversationSummaryRequest,
  KnowledgeSummaryRequest,
  RetrievalEvalJudgeRequest,
  RetrievalEvalJudgeResult,
  RetrievedChunk,
  TextChunkDraft,
} from './ai-client.interface';
import {
  applyRerankScores,
  lexicalRerank,
  parseRerankScoresJson,
} from './llm-rerank.util';
import { resolveAiProvider } from './ai-provider';
import { heuristicRetrievalJudge } from './retrieval-eval.util';

export type OpenAiUsageSnapshot = {
  provider: 'openai';
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const CHAT_SYSTEM = `You are Memora, an enterprise knowledge assistant.
Answer using ONLY the provided context and conversation summary when relevant.
If the context does not contain enough information, say so clearly — do not invent facts.
End with a "Sources:" section listing citation numbers you used, e.g. [1] Document name - Page N.
Use the citation numbers from the context blocks.`;

@Injectable()
export class OpenAiAiClient implements AiClient, OnModuleInit {
  private readonly logger = new Logger(OpenAiAiClient.name);
  private client!: OpenAI;
  private chatModel!: string;
  private embeddingModel!: string;
  private summaryModel!: string;
  private pendingChatUsage: OpenAiUsageSnapshot | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('ai.openai.apiKey');
    if (
      resolveAiProvider(this.config.get<string>('ai.provider'), apiKey) !==
      'openai'
    ) {
      return;
    }
    this.initClient(apiKey!);
  }

  private initClient(apiKey: string) {
    if (this.client) {
      return;
    }
    this.client = new OpenAI({ apiKey });
    this.chatModel =
      this.config.get<string>('ai.openai.chatModel') ?? 'gpt-4o-mini';
    this.embeddingModel =
      this.config.get<string>('ai.openai.embeddingModel') ??
      'text-embedding-3-small';
    this.summaryModel =
      this.config.get<string>('ai.openai.summaryModel') ?? 'gpt-4o-mini';
    this.logger.log(
      `OpenAI AI client ready (chat=${this.chatModel}, embed=${this.embeddingModel})`,
    );
  }

  private ensureClient(): OpenAI {
    const apiKey = this.config.get<string>('ai.openai.apiKey');
    if (!apiKey?.trim()) {
      throw new Error(
        'OpenAI is active but OPENAI_API_KEY is missing. Set the key or AI_PROVIDER=stub.',
      );
    }
    this.initClient(apiKey);
    return this.client;
  }

  /** Consumes and clears usage from the last chatStream call. */
  readChatUsage(): OpenAiUsageSnapshot | null {
    const usage = this.pendingChatUsage;
    this.pendingChatUsage = null;
    return usage;
  }

  async extractText(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<string> {
    const name = input.filename.toLowerCase();
    if (
      input.mimeType === 'text/plain' ||
      input.mimeType === 'text/markdown' ||
      name.endsWith('.txt') ||
      name.endsWith('.md')
    ) {
      return input.buffer.toString('utf8');
    }

    if (input.mimeType === 'application/pdf' || name.endsWith('.pdf')) {
      const parser = new PDFParse({ data: input.buffer });
      try {
        const textResult = await parser.getText();
        return textResult.text?.trim() || '';
      } finally {
        await parser.destroy();
      }
    }

    if (
      input.mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer: input.buffer });
      return result.value?.trim() || '';
    }

    throw new Error(
      `Unsupported document type for extraction: ${input.mimeType} (${input.filename})`,
    );
  }

  async chunkText(text: string): Promise<TextChunkDraft[]> {
    const size = 800;
    const overlap = 100;
    const chunks: TextChunkDraft[] = [];
    let i = 0;
    let index = 0;

    while (i < text.length) {
      const content = text.slice(i, i + size).trim();
      if (content) {
        chunks.push({
          content,
          chunkIndex: index,
          pageNumber: Math.floor(index / 3) + 1,
        });
        index += 1;
      }
      i += size - overlap;
    }

    return chunks.length
      ? chunks
      : [{ content: text || 'empty', chunkIndex: 0, pageNumber: 1 }];
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];

    const client = this.ensureClient();
    const batchSize = 64;
    const vectors: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await client.embeddings.create({
        model: this.embeddingModel,
        input: batch,
      });
      vectors.push(
        ...response.data
          .sort((a, b) => a.index - b.index)
          .map((row) => row.embedding),
      );
    }

    return vectors;
  }

  async rerank(
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    if (chunks.length <= 1) {
      return chunks;
    }

    const limited = chunks.slice(0, 20);
    const listing = limited
      .map(
        (c, i) =>
          `[${i}] ${c.documentName}\n${c.content.slice(0, 500).replace(/\s+/g, ' ')}`,
      )
      .join('\n\n');

    try {
      const response = await this.ensureClient().chat.completions.create({
        model: this.summaryModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Score each passage for relevance to the user query. Return JSON only: {"scores":[{"index":number,"score":number}]} with score from 0 to 1.',
          },
          {
            role: 'user',
            content: `Query: ${query}\n\nPassages:\n${listing}`,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        return lexicalRerank(query, limited);
      }
      const scores = parseRerankScoresJson(raw, limited.length);
      if (!scores.length) {
        return lexicalRerank(query, limited);
      }
      return applyRerankScores(limited, scores);
    } catch (err) {
      this.logger.warn(
        `LLM rerank failed, using lexical fallback: ${err instanceof Error ? err.message : err}`,
      );
      return lexicalRerank(query, limited);
    }
  }

  async judgeRetrievalContext(
    request: RetrievalEvalJudgeRequest,
  ): Promise<RetrievalEvalJudgeResult> {
    if (!request.retrievedContext.trim()) {
      return { answerRelevance: 0, faithfulness: 0 };
    }

    try {
      const response = await this.ensureClient().chat.completions.create({
        model: this.summaryModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You judge retrieval quality for RAG eval. Return JSON only: {"answerRelevance":0-1,"faithfulness":0-1}. answerRelevance: could the context help answer the question? faithfulness: is the context internally consistent and on-topic (not junk)?',
          },
          {
            role: 'user',
            content: [
              `Question: ${request.question}`,
              `Expected answer themes (hints): ${request.expectedAnswerHints.join(', ') || '(none)'}`,
              '',
              'Retrieved context:',
              request.retrievedContext.slice(0, 12_000),
            ].join('\n'),
          },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        return heuristicRetrievalJudge(request);
      }
      const parsed = JSON.parse(raw) as {
        answerRelevance?: number;
        faithfulness?: number;
      };
      const clamp = (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n)
          ? Math.min(1, Math.max(0, n))
          : 0;
      return {
        answerRelevance: clamp(parsed.answerRelevance),
        faithfulness: clamp(parsed.faithfulness),
      };
    } catch (err) {
      this.logger.warn(
        `LLM eval judge failed, using heuristic: ${err instanceof Error ? err.message : err}`,
      );
      return heuristicRetrievalJudge(request);
    }
  }

  async *chatStream(
    request: ChatRequest,
  ): AsyncGenerator<string, void, unknown> {
    this.pendingChatUsage = null;
    const stream = await this.ensureClient().chat.completions.create({
      model: this.chatModel,
      messages: this.buildChatMessages(request),
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
      if (chunk.usage) {
        this.pendingChatUsage = {
          provider: 'openai',
          model: this.chatModel,
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }

  async summarizeConversation(
    request: ConversationSummaryRequest,
  ): Promise<string> {
    const response = await this.ensureClient().chat.completions.create({
      model: this.summaryModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Compress the conversation into a concise rolling summary for future turns. Preserve facts, decisions, and open questions. Max ~400 words.',
        },
        {
          role: 'user',
          content: [
            request.previousSummary
              ? `Previous summary:\n${request.previousSummary}`
              : 'Previous summary: (none)',
            '',
            'New messages to fold in:',
            ...request.messages.map((m) => `${m.role}: ${m.content}`),
          ].join('\n'),
        },
      ],
    });

    return (
      response.choices[0]?.message?.content?.trim() ||
      request.previousSummary ||
      ''
    ).slice(0, 1500);
  }

  async summarizeKnowledge(
    request: KnowledgeSummaryRequest,
  ): Promise<string> {
    const response = await this.ensureClient().chat.completions.create({
      model: this.summaryModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `Write a structured ${request.kind} knowledge summary for search and chat retrieval. Use bullet points where helpful. Max ~800 words.`,
        },
        {
          role: 'user',
          content: `Title: ${request.title}\n\nContent:\n${request.text.slice(0, 120_000)}`,
        },
      ],
    });

    return (response.choices[0]?.message?.content?.trim() || '').slice(
      0,
      4000,
    );
  }

  private buildChatMessages(
    request: ChatRequest,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const contextBlock = request.contexts.length
      ? request.contexts
          .map((c, i) => {
            const loc = c.pageNumber ? ` (page ${c.pageNumber})` : '';
            return `[${i + 1}] ${c.documentName}${loc}\n${c.content}`;
          })
          .join('\n\n---\n\n')
      : '(No retrieved context.)';

    const historyMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      request.history.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));

    const userContent = [
      request.conversationSummary
        ? `Conversation memory:\n${request.conversationSummary}`
        : '',
      '',
      'Retrieved context:',
      contextBlock,
      '',
      `User question: ${request.question}`,
    ]
      .filter(Boolean)
      .join('\n');

    return [
      { role: 'system', content: CHAT_SYSTEM },
      ...historyMessages,
      { role: 'user', content: userContent },
    ];
  }
}
