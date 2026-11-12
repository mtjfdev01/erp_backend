import { IsOptional, IsString, IsIn } from "class-validator";
import { Type } from "class-transformer";

export class ReconciliationWorkbenchQueryDto {
  @IsOptional()
  @IsIn(["all", "online", "offline", "donation_box", "recurring"])
  tab?: "all" | "online" | "offline" | "donation_box" | "recurring" = "all";

  @IsOptional()
  @IsIn(["installments", "subscriptions"])
  recurring_sub_tab?: "installments" | "subscriptions" = "installments";

  @IsOptional()
  @IsIn(["all", "0_3", "4_7", "8_15", "over_15"])
  age_bucket?: "all" | "0_3" | "4_7" | "8_15" | "over_15" = "all";

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
