import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsArray,
  IsInt,
} from "class-validator";
import { Department } from "../../users/user.entity";
import {
  ComplaintPriority,
  ComplaintWorkflowType,
  ComplaintType,
  ComplaintKind,
  ComplaintScope,
  RecurrenceEndType,
} from "../entities/complaint.entity";

export class CreateComplaintDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(Department)
  department: Department;

  @IsOptional()
  @IsEnum(ComplaintPriority)
  priority?: ComplaintPriority;

  @IsOptional()
  @IsEnum(ComplaintKind)
  type?: ComplaintKind;

  @IsOptional()
  @IsEnum(ComplaintScope)
  scope?: ComplaintScope;

  @IsOptional()
  @IsEnum(ComplaintWorkflowType)
  workflow_type?: ComplaintWorkflowType;

  @IsOptional()
  @IsEnum(ComplaintType)
  complaint_type?: ComplaintType;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigned_users?: number[];

  @IsOptional()
  @IsArray()
  assigned_users_meta?: Array<{ user_id: number; department: Department }>;

  @IsOptional()
  @IsString()
  project_id?: string;

  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsString()
  recurrence_rule?: string;

  @IsOptional()
  @IsDateString()
  recurrence_next_date?: string;

  @IsOptional()
  @IsEnum(RecurrenceEndType)
  recurrence_end_type?: RecurrenceEndType;

  @IsOptional()
  @IsDateString()
  recurrence_end_date?: string;

  @IsOptional()
  @IsInt()
  recurrence_end_occurrences?: number;

  @IsOptional()
  @IsBoolean()
  approval_required?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  approval_required_user_ids?: number[];

  @IsOptional()
  @IsInt()
  reported_by_id?: number;

  @IsOptional()
  @IsArray()
  mov_checklist?: {
    text: string;
    checked: boolean;
    checked_by_id: number;
    checked_at: Date;
  }[];

  @IsOptional()
  @IsArray()
  mov_assignments?: {
    mov_index: number;
    user_id: number | null;
  }[];
}
