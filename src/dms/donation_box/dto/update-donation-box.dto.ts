import { PartialType } from "@nestjs/mapped-types";
import { CreateDonationBoxDto } from "./create-donation-box.dto";

export class UpdateDonationBoxDto extends PartialType(CreateDonationBoxDto) {}
