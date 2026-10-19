import { IsArray, IsInt, IsOptional, IsString } from "class-validator";
import { Department } from "../../users/user.entity";

export class AssignTaskDto {
  @IsString()
  assignee_name: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigned_users?: number[];

  @IsOptional()
  @IsArray()
  assigned_users_meta?: Array<{ user_id: number; department: Department }>;

  /**
   * Reporting Manager IDs (Multi-manager support):
   * When reassigning or assigning tasks, if assigned_users are provided,
   * reporting managers are automatically derived from DMS user management.
   * Can also be explicitly passed as an array of IDs.
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
}
