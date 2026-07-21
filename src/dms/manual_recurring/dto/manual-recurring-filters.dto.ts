import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import { ManualRecurringStatus } from "../utils/manual-recurring.constants";

export class ManualRecurringPledgeFiltersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ManualRecurringStatus)
  status?: ManualRecurringStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  donor_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  campaign_id?: number;
}

export class ProcessManualRecurringRemindersDto {
  /** YYYY-MM — defaults to current month in PKT */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  period_key?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  dry_run?: boolean;

  /** Send even if already reminded this period */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  force?: boolean;

  /** Pledges processed per DB batch (default from env or 500) */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  chunk_size?: number;

  /** Include per-donor detail rows in the response (off by default at scale) */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  include_details?: boolean;
}
