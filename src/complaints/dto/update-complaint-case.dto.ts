import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  MaxLength,
} from "class-validator";
import { Department } from "../../users/user.entity";
import { ComplaintCategory } from "../entities/complaint.entity";

export class UpdateComplaintCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(ComplaintCategory)
  complaint_category?: ComplaintCategory;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  complaint_category_custom?: string;

  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsInt()
  related_issue_id?: number;
}
