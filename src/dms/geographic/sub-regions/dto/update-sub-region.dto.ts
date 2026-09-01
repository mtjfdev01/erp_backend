import { PartialType } from "@nestjs/mapped-types";
import { CreateSubRegionDto } from "./create-sub-region.dto";

export class UpdateSubRegionDto extends PartialType(CreateSubRegionDto) {}
