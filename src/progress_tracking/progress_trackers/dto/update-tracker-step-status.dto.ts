import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { ProgressStatus } from "../../common/progress-tracking.enum";

export class UpdateTrackerStepStatusDto {
  @IsEnum(ProgressStatus)
  status: ProgressStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any> | null;

  @IsOptional()
  @IsBoolean()
  donor_visible?: boolean;
}
