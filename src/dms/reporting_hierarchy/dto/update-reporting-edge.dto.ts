import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateReportingEdgeDto } from "./create-reporting-edge.dto";

export class UpdateReportingEdgeDto extends PartialType(CreateReportingEdgeDto) {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
