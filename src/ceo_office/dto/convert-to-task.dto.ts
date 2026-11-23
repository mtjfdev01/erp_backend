import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsInt,
  IsString,
  IsBoolean,
  IsArray,
} from "class-validator";
import { Transform } from "class-transformer";
import { Department } from "../../users/user.entity";
import {
  TaskPriority,
  TaskWorkflowType,
  TaskType,
  RecurrenceEndType,
} from "../../tasks/entities/task.entity";

export class ConvertToTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  task_title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  task_description?: string;

  @IsEnum(Department)
  @IsOptional()
  department?: Department;

  @IsEnum(Department)
  @IsOptional()
  task_department?: Department;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsEnum(TaskPriority)
  @IsOptional()
  task_priority?: TaskPriority;

  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsDateString()
  @IsOptional()
  task_due_date?: string;

  @IsOptional()
  @IsEnum(TaskWorkflowType)
  workflow_type?: TaskWorkflowType;

  @IsOptional()
  @IsEnum(TaskType)
  task_type?: TaskType;

  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsString()
  project_id?: string;

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
  @IsDateString()
  approval_due_date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  approval_required_user_ids?: number[];

  @Transform(({ value }) => 
    Array.isArray(value) 
      ? value.map((id) => Number(id)).filter((id) => !isNaN(id)) 
      : value
  )
  @IsInt({ each: true })
  @IsOptional()
  assigned_users?: number[];

  @IsOptional()
  @IsArray()
  assigned_users_meta?: Array<{ user_id: number; department: Department }>;

  @IsOptional()
  @IsArray()
  mov_checklist?: {
    text: string;
    checked?: boolean;
    checked_by_id?: number | null;
    checked_at?: Date | string | null;
  }[];

  @IsString({ each: true })
  @IsOptional()
  mov_items?: string[];

  @IsOptional()
  mov_assignments?: { mov_index: number; user_id: number | null }[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reported_to_ids?: number[];

  @IsOptional()
  @IsInt()
  reported_to_id?: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  source_id?: number;
}
