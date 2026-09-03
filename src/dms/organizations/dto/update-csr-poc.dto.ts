import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
  MaxLength,
} from "class-validator";
import { OrganizationAffiliationRole } from "../entities/donor-organization-affiliation.entity";

export class UpdateCsrPocDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnic?: string | null;

  @IsOptional()
  @IsString()
  business_type?: string | null;

  @IsOptional()
  @IsString()
  business_type_other?: string | null;

  @IsOptional()
  @IsString()
  area_of_interest?: string | null;

  @IsOptional()
  @IsNumber()
  branch_id?: number | null;

  @IsOptional()
  @IsString()
  role?: OrganizationAffiliationRole | string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
