import { IsOptional, IsString, IsNumber, IsDateString, IsEmail, IsPhoneNumber, IsEnum } from 'class-validator';
import { DonationMethod } from 'src/utils/enums';

export class CreateDonationDto {
  @IsOptional()
  @IsString()
  project_id?: string;

  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: Date;

  @IsOptional()
  @IsString()
  currency?: string;

  // Donor information
  @IsOptional()
  @IsString()
  donor_name?: string;

  @IsOptional()
  @IsEmail()
  donor_email?: string;

  @IsOptional()
  @IsString()
  donor_phone?: string;

  @IsOptional()
  @IsString()
  donation_type?: string;

  @IsOptional()
  @IsEnum(DonationMethod, { message: 'donation_method must be either "meezan" or "blinq"' })
  donation_method?: DonationMethod;

  @IsOptional()
  @IsString()
  donation_source?: string;

  @IsOptional()
  @IsString()
  ref?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Item information
  @IsOptional()
  @IsString()
  item_name?: string;

  @IsOptional()
  @IsString()
  item_description?: string;

  @IsOptional()
  @IsNumber()
  item_price?: number;

  @IsOptional()
  @IsString()
  status?: string;

  // ⭐ NEW: Cheque payment fields
  @IsOptional()
  @IsString()
  cheque_number?: string;

  @IsOptional()
  @IsString()
  bank_name?: string;

  // ⭐ NEW: In-kind donation fields
  @IsOptional()
  @IsString()
  in_kind_item_name?: string;

  @IsOptional()
  @IsString()
  in_kind_description?: string;

  @IsOptional()
  @IsNumber()
  in_kind_quantity?: number;

  @IsOptional()
  @IsNumber()
  donor_id?: number;

  // ⭐ NEW: In-kind items array
  @IsOptional()
  in_kind_items?: Array<{
    name: string;
    item_code?: string;
    description?: string;
    category?: string;
    condition?: string;
    quantity: number;
    estimated_value?: number;
    brand?: string;
    model?: string;
    size?: string;
    color?: string;
    collection_date: string;
    collection_location?: string;
    notes?: string;
  }>;

  @IsOptional()
  @IsString()
  previous_donation_id?: string;

}
