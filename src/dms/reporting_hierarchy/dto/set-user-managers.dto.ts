import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

/** Replace a user's reporting managers (standalone module only). */
export class SetUserManagersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  primary_manager_id?: number | null;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  secondary_manager_ids?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  department?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
