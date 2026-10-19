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

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reported_to_ids?: number[];

  @IsOptional()
  reported_to?: number[] | number;

  @IsOptional()
  @IsInt()
  reported_to_id?: number;
}
