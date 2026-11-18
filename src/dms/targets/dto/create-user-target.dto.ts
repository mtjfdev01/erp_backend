import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  UserTargetPeriodType,
  UserTargetType,
} from "../entities/user-target.entity";

export class CreateUserTargetDto {
  @IsInt()
  user_id: number;

  @IsEnum(UserTargetType)
  target_type: UserTargetType;

  @IsNumber()
  @Min(0)
  target_amount: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  period_year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  period_month: number;

  @IsOptional()
  @IsEnum(UserTargetPeriodType)
  period_type?: UserTargetPeriodType;

  @IsOptional()
  @IsString()
  notes?: string;
}
