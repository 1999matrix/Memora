import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/jwt-payload.interface';
import { ConnectorsService } from './connectors.service';
import { CreateConnectorDto, UpdateConnectorDto } from './dto/connector.dto';

@ApiTags('connectors')
@ApiBearerAuth()
@Controller()
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Get('connectors/types')
  listTypes() {
    return this.connectorsService.listTypes();
  }

  @Post('workspaces/:workspaceId/connectors')
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateConnectorDto,
  ) {
    return this.connectorsService.create(user.id, workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/connectors')
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.connectorsService.findAll(user.id, workspaceId);
  }

  @Get('connectors/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorsService.findOne(user.id, id);
  }

  @Patch('connectors/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
  ) {
    return this.connectorsService.update(user.id, id, dto);
  }

  @Delete('connectors/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorsService.remove(user.id, id);
  }

  @Post('connectors/:id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorsService.testConnection(user.id, id);
  }

  @Post('connectors/:id/sync')
  sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connectorsService.enqueueSync(user.id, id);
  }
}
