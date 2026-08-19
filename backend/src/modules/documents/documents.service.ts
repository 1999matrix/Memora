import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_QUEUE,
  MAX_UPLOAD_BYTES,
} from '../../common/constants/rag.constants';
import { MembershipService } from '../../common/services/membership.service';
import {
  getSkipTake,
  paginatedResult,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.interface';
import { DocumentJobData } from '../queues/document.processor';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @InjectQueue(DOCUMENT_QUEUE)
    private readonly documentQueue: Queue<DocumentJobData>,
  ) {}

  async upload(
    userId: string,
    workspaceId: string,
    file: Express.Multer.File,
  ) {
    const membership = await this.membership.assertWorkspaceMember(
      userId,
      workspaceId,
    );

    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File too large (max 20MB)');
    }

    if (
      !ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_MIME_TYPES)[number],
      ) &&
      !file.originalname.match(/\.(pdf|docx|txt|md)$/i)
    ) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown',
      );
    }

    const stored = await this.storage.save(
      workspaceId,
      file.originalname,
      file.buffer,
    );

    const document = await this.prisma.document.create({
      data: {
        name: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        storageKey: stored.key,
        status: 'PENDING',
        organizationId: membership.workspace.organizationId,
        workspaceId,
        uploadedById: userId,
      },
    });

    await this.documentQueue.add(
      'process',
      { documentId: document.id },
      { removeOnComplete: 100, removeOnFail: 50, attempts: 3 },
    );

    return document;
  }

  async findAll(userId: string, workspaceId: string, page = 1, limit = 20) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    const { skip, take, page: p, limit: l } = getSkipTake(page, limit);
    const where = { workspaceId };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginatedResult(items, total, p, l);
  }

  async findOne(userId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        _count: { select: { chunks: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.membership.assertWorkspaceMember(userId, document.workspaceId);
    return document;
  }

  async remove(userId: string, documentId: string) {
    const document = await this.findOne(userId, documentId);
    await this.storage.delete(document.storageKey);
    await this.prisma.document.delete({ where: { id: documentId } });
    return { success: true };
  }
}
