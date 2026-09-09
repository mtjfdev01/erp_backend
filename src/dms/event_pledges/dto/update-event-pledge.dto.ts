import { PartialType } from "@nestjs/mapped-types";
import { CreateEventPledgeDto } from "./create-event-pledge.dto";

export class UpdateEventPledgeDto extends PartialType(CreateEventPledgeDto) {}
