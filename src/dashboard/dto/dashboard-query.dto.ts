import { IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number = 6;
}

export class DashboardMonthlyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number = 12;
}

export class DashboardEventsQueryDto {
  @IsOptional()
  @IsDateString()
  month?: string; // e.g. 2025-06-01
}

export class DashboardOverviewQueryDto {
  /** Year for the overview (e.g. 2024). If not set, uses current year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  /** Alternatively: last N months from today (overrides year if both provided). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;
}

export class DashboardFundraisingOverviewQueryDto {
  /** Year for the overview (e.g. 2024). If not set, uses current year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  /** Last N months from today (overrides year if both provided). Default 12. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number = 12;
}
