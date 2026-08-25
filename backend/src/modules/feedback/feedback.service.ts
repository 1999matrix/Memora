import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MembershipService } from '../../common/services/membership.service';
import { PrismaService } from '../../prisma';
import { CreateFeedbackDto } from './dto/feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async create(
    userId: string,
    messageId: string,
    dto: CreateFeedbackDto,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!message || message.role !== 'ASSISTANT') {
      throw new NotFoundException('Assistant message not found');
    }

    await this.membership.assertWorkspaceMember(
      userId,
      message.conversation.workspaceId,
    );

    try {
      return await this.prisma.messageFeedback.create({
        data: {
          rating: dto.rating,
          comment: dto.comment,
          retrievedChunks: (message.citations as object) ?? undefined,
          userId,
          workspaceId: message.conversation.workspaceId,
          conversationId: message.conversationId,
          messageId,
        },
      });
    } catch {
      throw new ConflictException('Feedback already submitted for this message');
    }
  }

  async listForWorkspace(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    return this.prisma.messageFeedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
