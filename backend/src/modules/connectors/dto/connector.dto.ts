import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { ConnectorType } from '../../../generated/prisma/client';

export const CONNECTOR_TYPES = Object.values(ConnectorType);

export class CreateConnectorDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(CONNECTOR_TYPES)
  type!: ConnectorType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateConnectorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
