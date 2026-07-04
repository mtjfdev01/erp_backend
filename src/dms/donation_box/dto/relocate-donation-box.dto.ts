import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
}
