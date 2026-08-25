import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum FeedbackRatingDto {
  UP = 'UP',
  DOWN = 'DOWN',
}

export class CreateFeedbackDto {
  @IsEnum(FeedbackRatingDto)
  rating!: FeedbackRatingDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
