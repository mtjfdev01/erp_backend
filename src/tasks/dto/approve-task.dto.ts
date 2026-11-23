import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ApproveTaskDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
