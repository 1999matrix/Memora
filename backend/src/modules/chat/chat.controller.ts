import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import type { AuthUser } from '../../common/interfaces/jwt-payload.interface';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @SkipResponseWrap()
  @Post('workspaces/:workspaceId/chat')
  async chat(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      for await (const event of this.chatService.streamChat(
        user.id,
        workspaceId,
        dto.message,
        dto.conversationId,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Chat failed';
      res.write(
        `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
      );
    }

    res.end();
  }

  @Get('workspaces/:workspaceId/conversations')
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.chatService.listConversations(user.id, workspaceId);
  }

  @Get('conversations/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chatService.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chatService.deleteConversation(user.id, id);
  }
}
