import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
  MaxLength,
} from "class-validator";
import { OrganizationAffiliationRole } from "../entities/donor-organization-affiliation.entity";

export class CreateCsrPocDto {
  @IsNumber()
  @IsNotEmpty()
  csr_donor_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnic?: string;

  @IsOptional()
  @IsString()
  business_type?: string;

  @IsOptional()
  @IsString()
  business_type_other?: string;

  @IsOptional()
  @IsString()
  area_of_interest?: string;

  @IsOptional()
  @IsNumber()
  branch_id?: number;

  @IsOptional()
  @IsString()
  role?: OrganizationAffiliationRole | string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
