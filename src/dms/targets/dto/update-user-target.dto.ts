import { PartialType } from "@nestjs/mapped-types";
import { CreateUserTargetDto } from "./create-user-target.dto";

export class UpdateUserTargetDto extends PartialType(CreateUserTargetDto) {}
