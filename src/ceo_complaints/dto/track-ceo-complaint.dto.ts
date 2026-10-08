import { IsString, MinLength, MaxLength } from "class-validator";

export class TrackCeoComplaintDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  complaint_number: string;
}
