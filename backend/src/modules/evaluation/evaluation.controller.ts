import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { AuthUser } from '../../common/interfaces/jwt-payload.interface';
import { EvaluationService } from './evaluation.service';

class RunEvalDto {
  @IsString()
  workspaceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  topK?: number;
}

@ApiTags('evaluation')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluation: EvaluationService) {}

  @Post('runs')
  run(@CurrentUser() user: AuthUser, @Body() dto: RunEvalDto) {
    return this.evaluation.run({
      userId: user.id,
      workspaceId: dto.workspaceId,
      topK: dto.topK,
      createdById: user.id,
    });
  }

  @Get('runs')
  list() {
    return this.evaluation.listRuns();
  }
}
