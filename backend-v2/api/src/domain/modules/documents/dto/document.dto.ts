import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchDocumentsDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsOptional()
  topK?: number;
}
