import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { ComplaintStatus } from "../entities/complaint.entity";

export class StatusTransitionDto {
  @IsEnum(ComplaintStatus)
  status: ComplaintStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  force_complete?: boolean;
}
