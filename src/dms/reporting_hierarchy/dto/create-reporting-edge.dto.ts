import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateReportingEdgeDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  manager_id: number;

  @IsOptional()
  @IsIn(["primary", "secondary"])
  relationship?: "primary" | "secondary";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  department?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
