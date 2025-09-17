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
}
