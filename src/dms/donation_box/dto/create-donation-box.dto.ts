import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsDateString,
  IsPhoneNumber,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ValidateIf,
} from "class-validator";
import {
  BoxType,
  BoxStatus,
  CollectionFrequency,
} from "../entities/donation-box.entity";

export class CreateDonationBoxDto {
  // Box Identification (Required)

  @IsString()
  @IsOptional()
  box_id_no?: string;

  @IsString()
  @IsOptional()
  key_no?: string;

  // Location Details (Required) - Geographic Reference
  @IsNumber()
  @IsNotEmpty({ message: "Route ID is required" })
  route_id: number;

  @IsNumber()
  @IsOptional()
  city_id?: number;

  // Shop Details (Required shop_name)
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
  address?: string;

  @IsString()
  @IsOptional()
  landmark_marketplace?: string;

  // Box Details
  @IsEnum(BoxType, {
    message: "Box type must be small, medium, large, or custom",
  })
  @IsNotEmpty({ message: "Box type is required" })
  box_type: BoxType;

  @IsEnum(BoxStatus, {
    message: "Status must be active, inactive, maintenance, or retired",
  })
  @IsNotEmpty({ message: "Status is required" })
  status: BoxStatus;

  @IsEnum(CollectionFrequency, {
    message:
      "Frequency must be daily, weekly, bi-weekly, monthly, quarterly, or as-needed",
  })
  @IsOptional()
  frequency?: CollectionFrequency;

  @IsDateString()
  @IsNotEmpty({ message: "Active since date is required" })
  active_since: Date;

  @IsString()
  @IsOptional()
  notes?: string;

  // User Assignment (Optional)
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  assigned_user_ids?: number[];

  @IsBoolean()
  @IsOptional()
  require_collection_location?: boolean;

  @ValidateIf((dto) => dto.require_collection_location !== false)
  @IsNumber()
  @IsNotEmpty({ message: "Device GPS latitude is required when on-site collection is enabled" })
  @Min(-90)
  @Max(90)
  registration_latitude?: number;

  @ValidateIf((dto) => dto.require_collection_location !== false)
  @IsNumber()
  @IsNotEmpty({ message: "Device GPS longitude is required when on-site collection is enabled" })
  @Min(-180)
  @Max(180)
  registration_longitude?: number;

  @IsString()
  @IsOptional()
  registration_location_name?: string;

  @IsOptional()
  registration_location_details?: Record<string, string>;

  @IsNumber()
  @IsOptional()
  @Min(10)
  @Max(10000)
  location_radius_meters?: number;
}
