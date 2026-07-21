import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from "class-validator";

/** Stripe subscription billing interval (Checkout + Elements). */
export enum DonationRecurringInterval {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
}

/** When the first / subsequent billing cycle should start. */
export enum DonationRecurringStartDateMode {
  SAME_DATE = "same_date",
  FIRST_OF_MONTH = "first_of_month",
  CUSTOM = "custom",
}

export class DonationRecurringDto {
  @IsEnum(DonationRecurringInterval, {
    message: "recurring.interval must be one of: day, week, month, year",
  })
  interval: DonationRecurringInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  interval_count?: number;

  @IsOptional()
  @IsEnum(DonationRecurringStartDateMode, {
    message:
      "recurring.start_date_mode must be one of: same_date, first_of_month, custom",
  })
  start_date_mode?: DonationRecurringStartDateMode;

  /** YYYY-MM-DD. Required when start_date_mode is custom; also sent for first_of_month. */
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}
