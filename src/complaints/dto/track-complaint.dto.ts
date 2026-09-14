import { IsString, MinLength, MaxLength } from "class-validator";

export class TrackComplaintDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}
