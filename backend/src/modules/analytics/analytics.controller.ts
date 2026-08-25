import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UsageService } from './usage.service';

class CostQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly usage: UsageService) {}

  @Get('costs')
  costs(@Query() query: CostQueryDto) {
    return this.usage.costSummary(query.organizationId);
  }
}
