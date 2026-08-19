import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/jwt-payload.interface';
import { RetrievalSearchDto } from './dto/retrieval.dto';
import { RetrievalService } from './retrieval.service';

@ApiTags('retrieval')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/retrieval')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Post('search')
  search(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RetrievalSearchDto,
  ) {
    return this.retrievalService.search(
      user.id,
      workspaceId,
      dto.query,
      dto.topK,
    );
  }
}
