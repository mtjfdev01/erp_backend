import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsDateString,
  Min,
  MaxLength,
} from "class-validator";
import { Department } from "../../users/user.entity";

export class CreateComplaintMeetingDto {
  @IsDateString()
  scheduled_at: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  duration_minutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agenda?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  attendee_user_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsEnum(Department, { each: true })
  attendee_departments?: Department[];
}
