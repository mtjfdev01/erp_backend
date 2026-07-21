import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  IsArray,
} from "class-validator";
import { Type } from "class-transformer";
import { CampaignStatus } from "../entities/campaign.entity";
import { CampaignTargetFrequency } from "../utils/campaign-recurring.constants";
import { CampaignCommunicationTemplatesDto } from "./campaign-communication-templates.dto";
import { CreateCampaignDonationItemDto } from "./campaign-donation-item.dto";

export class CreateCampaignDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  goal_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsDateString()
  start_at?: string;

  @IsOptional()
  @IsDateString()
  @ValidateIf((o) => o.start_at != null)
  end_at?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  project_id?: number;

  @IsOptional()
  @IsString()
  cover_image_url?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_featured?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_recurring?: boolean;

  @ValidateIf((o) => o.is_recurring === true)
  @IsEnum(CampaignTargetFrequency)
  target_frequency?: CampaignTargetFrequency | null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  monthly_donor_automation_enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignCommunicationTemplatesDto)
  communication_templates?: CampaignCommunicationTemplatesDto | null;

  /** Saved after campaign is created (campaign_id assigned server-side). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCampaignDonationItemDto)
  donation_items?: CreateCampaignDonationItemDto[];
}
