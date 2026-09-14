import { IsArray, IsEnum, IsInt, IsOptional } from "class-validator";
import { Department } from "../../users/user.entity";

export class ManageComplaintNomineesDto {
  @IsOptional()
  @IsArray()
  @IsEnum(Department, { each: true })
  nominated_departments?: Department[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  nominated_user_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  investigator_ids?: number[];
}
