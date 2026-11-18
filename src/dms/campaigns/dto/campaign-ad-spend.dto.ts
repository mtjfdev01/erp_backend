import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateCampaignAdSpendDto {
  @IsString()
  @MaxLength(120)
  platform: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsDateString()
  spend_date?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  attachment_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  attachment_type?: string | null;
}

export class UpdateCampaignAdSpendDto extends CreateCampaignAdSpendDto {}
