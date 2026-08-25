import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/jwt-payload.interface';
import { KnowledgeSummaryService } from './knowledge-summary.service';

@ApiTags('summaries')
@ApiBearerAuth()
@Controller()
export class SummariesController {
  constructor(private readonly summaries: KnowledgeSummaryService) {}

  @Get('workspaces/:workspaceId/summaries')
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.summaries.listForWorkspace(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/summaries/refresh')
  refreshWorkspace(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.summaries.enqueueWorkspace(user.id, workspaceId);
  }

  @Post('connectors/:id/summaries/refresh')
  refreshConnector(
    @CurrentUser() user: AuthUser,
    @Param('id') connectorId: string,
  ) {
    return this.summaries.enqueueConnector(user.id, connectorId);
  }

  @Post('documents/:id/summaries/refresh')
  refreshDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') documentId: string,
  ) {
    return this.summaries.enqueueDocumentForUser(user.id, documentId);
  }
}
