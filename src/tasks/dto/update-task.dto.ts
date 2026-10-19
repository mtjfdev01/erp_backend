import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsInt,
} from "class-validator";
import {
  TaskPriority,
  TaskStatus,
  TaskWorkflowType,
  TaskType,
  RecurrenceEndType,
} from "../entities/task.entity";
import { Department } from "../../users/user.entity";

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskWorkflowType)
  workflow_type?: TaskWorkflowType;

  @IsOptional()
  @IsEnum(TaskType)
  task_type?: TaskType;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  project_id?: string;

  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigned_users?: number[];

  @IsOptional()
  @IsArray()
  assigned_users_meta?: Array<{ user_id: number; department: Department }>;

  /**
   * Reporting Manager IDs (Multi-manager support):
   * Updated reporting manager IDs. If assigned_users are updated and reported_to_ids are omitted,
   * reporting managers are automatically re-derived from the assigned users' DMS configuration.
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reported_to_ids?: number[];

  /**
   * Accepts multiple manager IDs (number[]) or a legacy single manager ID (number).
   */
  @IsOptional()
  reported_to?: number[] | number;

  /**
   * Legacy single reporting manager ID field (mapped to reported_to_ids internally).
   */
  @IsOptional()
  @IsInt()
  reported_to_id?: number;

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
  @IsArray()
  @IsInt({ each: true })
  approval_required_user_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mov_items?: string[];

  @IsOptional()
  @IsArray()
  mov_assignments?: {
    mov_index: number;
    user_id: number | null;
  }[];
}
