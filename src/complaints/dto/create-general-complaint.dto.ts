import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  MaxLength,
  MinLength,
} from "class-validator";
import { Department } from "../../users/user.entity";
import {
  ComplaintCategory,
  ComplaintScope,
} from "../entities/complaint.entity";

export class CreateGeneralComplaintDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  complainer_narrative?: string;

  @IsEnum(Department)
  department: Department;

  @IsEnum(ComplaintCategory)
  complaint_category: ComplaintCategory;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  complaint_category_custom?: string;

  @IsArray()
  @IsEnum(Department, { each: true })
  nominated_departments: Department[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  nominated_user_ids?: number[];

  @IsOptional()
  @IsInt()
  related_issue_id?: number;

  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsEnum(ComplaintScope)
  scope?: ComplaintScope;

  @IsOptional()
  @IsString()
  submission_channel?: string;
}
