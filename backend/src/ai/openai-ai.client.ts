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
  RetrievedChunk,
  TextChunkDraft,
} from './ai-client.interface';
import { resolveAiProvider } from './ai-provider';

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
    if (resolveAiProvider(this.config.get<string>('ai.provider')) !== 'openai') {
      return;
    }
    const apiKey = this.config.get<string>('ai.openai.apiKey');
    if (!apiKey) {
      throw new Error(
        'AI_PROVIDER=openai requires OPENAI_API_KEY. Set the key or use AI_PROVIDER=stub.',
      );
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

    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding);
  }

  async rerank(
    _query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    // ponytail: pass-through until Cohere/voyage rerank or a dedicated rerank model is wired.
    return chunks;
  }

  async *chatStream(
    request: ChatRequest,
  ): AsyncGenerator<string, void, unknown> {
    this.pendingChatUsage = null;
    const stream = await this.client.chat.completions.create({
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
    const response = await this.client.chat.completions.create({
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
    const response = await this.client.chat.completions.create({
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
