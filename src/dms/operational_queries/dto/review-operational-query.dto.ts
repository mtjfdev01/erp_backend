import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewOperationalQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review_note?: string;
}
