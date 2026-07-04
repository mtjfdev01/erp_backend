import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewDonationAllotmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decision_note?: string;
}
