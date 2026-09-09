import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateRecurringDonationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  donor_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsIn(["day", "week", "month", "year"])
  billing_interval: "day" | "week" | "month" | "year";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  billing_interval_count?: number;

  @IsOptional()
  @IsIn(["same_date", "first_of_month", "custom"])
  start_date_mode?: string;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  @IsOptional()
  @IsString()
  donation_method?: string;

  @IsOptional()
  @IsString()
  project_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  campaign_id?: number;

  @IsOptional()
  @IsString()
  donation_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  prepaid_periods?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  initial_donation_id?: number;

  @IsOptional()
  @IsIn(["active", "canceled", "past_due", "failed"])
  status?: string;
}
