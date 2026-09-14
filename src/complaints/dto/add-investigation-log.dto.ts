import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ComplaintInvestigationAction } from "../entities/complaint-investigation-log.entity";

export class AddInvestigationLogDto {
  @IsOptional()
  @IsEnum(ComplaintInvestigationAction)
  action?: ComplaintInvestigationAction;

  @IsString()
  @MaxLength(5000)
  remarks: string;
}
