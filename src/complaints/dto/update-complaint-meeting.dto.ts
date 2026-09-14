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
import { ComplaintMeetingStatus } from "../entities/complaint-meeting.entity";

export class UpdateComplaintMeetingDto {
  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

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
  @IsString()
  @MaxLength(5000)
  discussion_notes?: string;

  @IsOptional()
  @IsEnum(ComplaintMeetingStatus)
  status?: ComplaintMeetingStatus;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  attendee_user_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsEnum(Department, { each: true })
  attendee_departments?: Department[];
}
