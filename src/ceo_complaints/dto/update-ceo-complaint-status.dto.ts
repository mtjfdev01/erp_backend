import { IsEnum } from "class-validator";
import { CeoComplaintStatus } from "../ceo-complaints.constants";

export class UpdateCeoComplaintStatusDto {
  @IsEnum(CeoComplaintStatus)
  status: CeoComplaintStatus;
}
