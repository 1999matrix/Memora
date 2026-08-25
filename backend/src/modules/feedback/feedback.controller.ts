import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/jwt-payload.interface';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('messages/:messageId/feedback')
  create(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.create(user.id, messageId, dto);
  }

  @Get('workspaces/:workspaceId/feedback')
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.feedbackService.listForWorkspace(user.id, workspaceId);
  }
}
