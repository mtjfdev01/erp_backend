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
