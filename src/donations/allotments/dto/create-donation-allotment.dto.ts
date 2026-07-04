import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDonationAllotmentDto {
  @IsOptional()
  @IsInt()
  credited_to_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  request_note?: string;
}
