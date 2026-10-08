import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  CeoComplaintCategory,
  CeoComplaintDepartment,
  CeoComplaintOrganization,
  CeoComplaintStatus,
  CeoComplainantType,
} from "../ceo-complaints.constants";

export class CreateCeoComplaintDto {
  @IsEnum(CeoComplaintOrganization)
  organization: CeoComplaintOrganization;

  @ValidateIf((o) => o.organization === CeoComplaintOrganization.ASLAB)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  branch?: string;

  @IsEnum(CeoComplainantType)
  complainant_type: CeoComplainantType;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  complainant_name: string;

  @IsString()
  @MinLength(7)
  @MaxLength(40)
  contact_number: string;

  @IsEnum(CeoComplaintDepartment)
  department: CeoComplaintDepartment;

  @IsEnum(CeoComplaintCategory)
  category: CeoComplaintCategory;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category_other?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  details: string;

  @IsOptional()
  @IsEnum(CeoComplaintStatus)
  status?: CeoComplaintStatus;
}
