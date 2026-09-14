import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ComplaintWorkflowStatus } from "../entities/complaint.entity";

export class UpdateComplaintWorkflowStatusDto {
  @IsEnum(ComplaintWorkflowStatus)
  status: ComplaintWorkflowStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resolution_summary?: string;
}
