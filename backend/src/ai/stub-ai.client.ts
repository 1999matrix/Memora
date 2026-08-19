import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

import { EMBEDDING_DIMENSIONS } from '../common/constants/rag.constants';
import {
  AiClient,
  ChatRequest,
  RetrievedChunk,
  TextChunkDraft,
} from './ai-client.interface';

/**
 * STUB AI — replace methods with real extractors / embeddings / LLM.
 * See docs/ai-hints-phase-2-4.md
 */
@Injectable()
export class StubAiClient implements AiClient {
  private readonly logger = new Logger(StubAiClient.name);

  async extractText(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<string> {
    this.logger.warn(
      `STUB extractText for ${input.filename} (${input.mimeType})`,
    );

    if (
      input.mimeType === 'text/plain' ||
      input.mimeType === 'text/markdown' ||
      input.filename.endsWith('.txt') ||
      input.filename.endsWith('.md')
    ) {
      return input.buffer.toString('utf8');
    }

    // PDF/DOCX: learner replaces with PyMuPDF / python-docx via FastAPI
    return [
      `[STUB EXTRACTION] File: ${input.filename}`,
      `Mime: ${input.mimeType}`,
      'Replace StubAiClient.extractText with real PDF/DOCX extraction.',
      'Sample knowledge: Memora PTO policy grants 24 annual leave days.',
      'Sample knowledge: Security reviews are required before production deploys.',
    ].join('\n');
  }

  async chunkText(text: string): Promise<TextChunkDraft[]> {
    this.logger.warn('STUB chunkText — simple fixed-size windows');
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
          metadata: { stub: true },
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
    this.logger.warn('STUB embed — deterministic pseudo-vectors');
    return texts.map((t) => this.hashEmbed(t));
  }

  async rerank(
    _query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    this.logger.warn('STUB rerank — pass-through');
    return chunks;
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    this.logger.warn('STUB chatStream — fake answer with citations shape');
    const sources = request.contexts
      .slice(0, 3)
      .map(
        (c, i) =>
          `[${i + 1}] ${c.documentName}${c.pageNumber ? ` - Page ${c.pageNumber}` : ''}`,
      )
      .join('\n');

    const answer = [
      `Stub answer for: "${request.question}"`,
      '',
      request.contexts[0]
        ? `Based on retrieved context: ${request.contexts[0].content.slice(0, 240)}...`
        : 'No retrieved context was available.',
      '',
      'Sources:',
      sources || '(none)',
      '',
      'Replace StubAiClient.chatStream with a real streaming LLM.',
    ].join('\n');

    const parts = answer.match(/.{1,40}/gs) || [answer];
    for (const part of parts) {
      yield part;
    }
  }

  private hashEmbed(text: string): number[] {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const hash = createHash('sha256').update(text).digest();
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
      const b = hash[i % hash.length];
      vector[i] = ((b / 255) * 2 - 1) / Math.sqrt(EMBEDDING_DIMENSIONS);
    }
    return vector;
  }
}
