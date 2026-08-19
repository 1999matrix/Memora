import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

import { AI_CLIENT, type AiClient } from '../../ai/ai-client.interface';
import { PrismaService } from '../../prisma';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.interface';

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
  ) {}

  async processDocument(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      this.logger.warn(`Document ${documentId} not found`);
      return;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING', errorMessage: null },
    });

    try {
      const buffer = await this.storage.read(document.storageKey);
      const extractedText = await this.ai.extractText({
        buffer,
        mimeType: document.mimeType,
        filename: document.name,
      });

      const contentHash = createHash('sha256')
        .update(extractedText)
        .digest('hex');

      await this.prisma.documentVersion.create({
        data: {
          documentId,
          version: 1,
          contentHash,
          extractedText,
        },
      });

      const drafts = await this.ai.chunkText(extractedText);
      const embeddings = await this.ai.embed(drafts.map((d) => d.content));

      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i];
        const embedding = embeddings[i];
        const chunk = await this.prisma.documentChunk.create({
          data: {
            documentId,
            organizationId: document.organizationId,
            workspaceId: document.workspaceId,
            content: draft.content,
            chunkIndex: draft.chunkIndex,
            pageNumber: draft.pageNumber,
            tokenCount: draft.content.split(/\s+/).length,
            metadata: (draft.metadata ?? {}) as object,
          },
        });

        await this.prisma.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
          `[${embedding.join(',')}]`,
          chunk.id,
        );
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'READY' },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Document processing failed';
      this.logger.error(`Failed processing ${documentId}: ${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw error;
    }
  }
}
