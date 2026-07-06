import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from "class-validator";

export class RelocateDonationBoxDto {
  @IsNumber()
  @IsNotEmpty({ message: "Route ID is required" })
  route_id: number;

  @IsNumber()
  @IsOptional()
  city_id?: number;

  @IsString()
  @IsNotEmpty({ message: "Shop name is required" })
  shop_name: string;

  @IsString()
  @IsOptional()
  shopkeeper?: string;

  @IsString()
  @IsOptional()
  cell_no?: string;

  @IsString()
  @IsOptional()
  landmark_marketplace?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  assigned_user_ids?: number[];

  @IsDateString()
  @IsOptional()
  active_since?: string;

  @IsString()
  @IsOptional()
  relocation_note?: string;

  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  registration_latitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  registration_longitude?: number;

  @IsString()
  @IsOptional()
  registration_location_name?: string;

  @IsOptional()
  registration_location_details?: Record<string, string>;
}
