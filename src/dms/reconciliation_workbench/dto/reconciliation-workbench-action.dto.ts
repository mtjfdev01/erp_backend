import { IsNotEmpty, IsNumber, IsOptional, IsString, IsIn, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ReconciliationWorkbenchActionDto {
  @IsNotEmpty()
  @IsIn(["offline", "online", "donation_box", "recurring_subscription", "recurring_installment"])
  type: "offline" | "online" | "donation_box" | "recurring_subscription" | "recurring_installment";

  @IsNotEmpty()
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkActionItemDto {
  @IsNotEmpty()
  @IsIn(["offline", "online", "donation_box", "recurring_subscription", "recurring_installment"])
  type: "offline" | "online" | "donation_box" | "recurring_subscription" | "recurring_installment";

  @IsNotEmpty()
  @IsNumber()
  id: number;
}

export class ReconciliationWorkbenchBulkApproveDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkActionItemDto)
  items: BulkActionItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
