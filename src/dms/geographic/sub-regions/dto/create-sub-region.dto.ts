import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  MaxLength,
  Length,
} from "class-validator";

export class CreateSubRegionDto {
  @IsString()
  @IsNotEmpty({ message: "Sub region name is required" })
  @MaxLength(100, { message: "Sub region name must not exceed 100 characters" })
  name: string;

  @IsString()
  @IsOptional()
  @Length(1, 10, { message: "Sub region code must be 1-10 characters" })
  code?: string;

  @IsNumber()
  @IsNotEmpty({ message: "Region ID is required" })
  region_id: number;

  @IsNumber()
  @IsNotEmpty({ message: "Country ID is required" })
  country_id: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}
