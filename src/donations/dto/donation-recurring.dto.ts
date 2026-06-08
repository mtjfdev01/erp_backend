import { IsEnum, IsInt, IsOptional, Min } from "class-validator";

/** Stripe subscription billing interval (Checkout + Elements). */
export enum DonationRecurringInterval {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
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
}
