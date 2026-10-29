import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  organizationId!: string;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddWorkspaceMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(['ADMIN', 'MEMBER'] as const)
  role!: 'ADMIN' | 'MEMBER';
}

export class UpdateWorkspaceMemberDto {
  @IsEnum(['ADMIN', 'MEMBER'] as const)
  role!: 'ADMIN' | 'MEMBER';
}
