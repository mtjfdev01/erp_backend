import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateEventPledgeDto {
  @IsString()
  @IsNotEmpty({ message: "Donor name is required" })
  @MaxLength(255)
  donor_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  care_of_representative?: string;

  @IsIn(["general", "zakat"], {
    message: "donation_type must be general or zakat",
  })
  donation_type: "general" | "zakat";

  @Type(() => Number)
  @IsNumber({}, { message: "Donation amount must be a number" })
  @Min(0.01, { message: "Donation amount must be greater than 0" })
  donation_amount: number;

  @IsOptional()
  @IsString()
  address?: string;
}
