import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateOperationalQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  subject_type: string;

  @IsInt()
  subject_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  action: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason: string;

  @IsInt()
  approver_id: number;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsObject()
  subject_meta?: Record<string, unknown>;
}
