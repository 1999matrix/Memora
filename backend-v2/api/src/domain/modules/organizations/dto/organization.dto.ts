import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}

export class AddOrganizationMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(['ADMIN', 'MEMBER'] as const)
  role!: 'ADMIN' | 'MEMBER';
}

export class UpdateOrganizationMemberDto {
  @IsEnum(['OWNER', 'ADMIN', 'MEMBER'] as const)
  role!: 'OWNER' | 'ADMIN' | 'MEMBER';
}
