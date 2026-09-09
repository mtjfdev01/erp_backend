import { PartialType } from "@nestjs/mapped-types";
import { CreateRecurringDonationDto } from "./create-recurring-donation.dto";

export class UpdateRecurringDonationDto extends PartialType(
  CreateRecurringDonationDto,
) {}
