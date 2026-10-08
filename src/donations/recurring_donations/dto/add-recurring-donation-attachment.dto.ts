import { IsOptional, IsString } from "class-validator";

export class AddRecurringDonationAttachmentDto {
  @IsString()
  file_name: string;

  @IsString()
  file_url: string;

  @IsString()
  file_type: string;

  @IsOptional()
  @IsString()
  description?: string;
}
