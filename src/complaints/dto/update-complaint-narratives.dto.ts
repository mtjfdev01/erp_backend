import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateComplaintNarrativesDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  complainer_narrative?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  accused_narrative?: string;
}
