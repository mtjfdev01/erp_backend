import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import {
  AidAttachmentContext,
  AidCaseSource,
  AidCeoApprovalStatus,
  AidDeliveryStatus,
  AidEducationLevel,
  AidHouseholdRole,
  AidKinshipRelation,
  AidLiteracyCategory,
  AidLiteracyStatus,
  AidMaritalStatus,
  AidPersonGender,
  AidBispStatus,
  AidNectaStatus,
  AidPropertyType,
  AidResidentType,
  AidRequestType,
  AidWriterRelation,
} from "../aid.enums";

export class CreateAidPersonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  full_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  father_or_husband_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  cnic?: string | null;

  @IsOptional()
  @IsDateString()
  cnic_expiry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_urdu?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  caste?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  phone_alternate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  photo_name?: string | null;

  @IsOptional()
  @IsEnum(AidPersonGender)
  gender?: AidPersonGender | null;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string | null;

  @IsOptional()
  @IsEnum(AidMaritalStatus)
  marital_status?: AidMaritalStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vulnerability?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  household_dependency?: string | null;

  @IsOptional()
  @IsEnum(AidEducationLevel)
  education_level?: AidEducationLevel | null;

  @IsOptional()
  @IsEnum(AidLiteracyStatus)
  literacy_status?: AidLiteracyStatus | null;

  @IsOptional()
  @IsEnum(AidLiteracyCategory)
  literacy_category?: AidLiteracyCategory | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  student_class?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  student_class_type?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  student_class_name?: string | null;

  @IsOptional()
  @IsString()
  monthly_income?: string | number | null;

  @IsOptional()
  @IsBoolean()
  has_disability?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  disability_type?: string | null;

  @IsOptional()
  @IsBoolean()
  has_land?: boolean;

  @IsOptional()
  @IsEnum(AidPropertyType)
  property_type?: AidPropertyType | null;

  @IsOptional()
  @IsString()
  property_details?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  property_area?: string | null;

  @IsOptional()
  @IsArray()
  property_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsEnum(AidResidentType)
  resident_type?: AidResidentType | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resident_ownership_status?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  resident_ownership_other?: string | null;

  @IsOptional()
  @IsString()
  rented_amount?: string | number | null;

  @IsOptional()
  @IsString()
  house_area_marla?: string | number | null;

  @IsOptional()
  @IsString()
  house_details?: string | null;

  @IsOptional()
  @IsArray()
  resident_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsBoolean()
  has_livestock?: boolean;

  @IsOptional()
  @IsArray()
  livestock_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsBoolean()
  has_vehicle?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicle_type?: string | null;

  @IsOptional()
  @IsArray()
  vehicle_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsEnum(AidNectaStatus)
  necta_status?: AidNectaStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  necta_document_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  necta_document_name?: string | null;

  @IsOptional()
  @IsEnum(AidBispStatus)
  bisp_status?: AidBispStatus | null;

  @IsOptional()
  @IsBoolean()
  is_alive?: boolean;

  @IsOptional()
  @IsString()
  health_notes?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tehsil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  union_council?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  landmark?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateAidPersonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  father_or_husband_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  cnic?: string | null;

  @IsOptional()
  @IsDateString()
  cnic_expiry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_urdu?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  caste?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  phone_alternate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  photo_name?: string | null;

  @IsOptional()
  @IsEnum(AidPersonGender)
  gender?: AidPersonGender | null;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string | null;

  @IsOptional()
  @IsEnum(AidMaritalStatus)
  marital_status?: AidMaritalStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vulnerability?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  household_dependency?: string | null;

  @IsOptional()
  @IsEnum(AidEducationLevel)
  education_level?: AidEducationLevel | null;

  @IsOptional()
  @IsEnum(AidLiteracyStatus)
  literacy_status?: AidLiteracyStatus | null;

  @IsOptional()
  @IsEnum(AidLiteracyCategory)
  literacy_category?: AidLiteracyCategory | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  student_class?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  student_class_type?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  student_class_name?: string | null;

  @IsOptional()
  @IsString()
  monthly_income?: string | number | null;

  @IsOptional()
  @IsBoolean()
  has_disability?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  disability_type?: string | null;

  @IsOptional()
  @IsBoolean()
  has_land?: boolean;

  @IsOptional()
  @IsEnum(AidPropertyType)
  property_type?: AidPropertyType | null;

  @IsOptional()
  @IsString()
  property_details?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  property_area?: string | null;

  @IsOptional()
  @IsArray()
  property_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsEnum(AidResidentType)
  resident_type?: AidResidentType | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resident_ownership_status?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  resident_ownership_other?: string | null;

  @IsOptional()
  @IsString()
  rented_amount?: string | number | null;

  @IsOptional()
  @IsString()
  house_area_marla?: string | number | null;

  @IsOptional()
  @IsString()
  house_details?: string | null;

  @IsOptional()
  @IsArray()
  resident_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsBoolean()
  has_livestock?: boolean;

  @IsOptional()
  @IsArray()
  livestock_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsBoolean()
  has_vehicle?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicle_type?: string | null;

  @IsOptional()
  @IsArray()
  vehicle_entries?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsEnum(AidNectaStatus)
  necta_status?: AidNectaStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  necta_document_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  necta_document_name?: string | null;

  @IsOptional()
  @IsEnum(AidBispStatus)
  bisp_status?: AidBispStatus | null;

  @IsOptional()
  @IsBoolean()
  is_alive?: boolean;

  @IsOptional()
  @IsString()
  health_notes?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tehsil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  union_council?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  landmark?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateAidHouseholdDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsInt()
  head_person_id?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  members?: CreateAidHouseholdMemberDto[];
}

export class UpdateAidHouseholdDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsInt()
  head_person_id?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateAidHouseholdMemberDto {
  @IsInt()
  person_id: number;

  @IsOptional()
  @IsEnum(AidHouseholdRole)
  role_in_household?: AidHouseholdRole;
}

export class CreateAidKinshipDto {
  @IsInt()
  to_person_id: number;

  @IsEnum(AidKinshipRelation)
  relation_type: AidKinshipRelation;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

/** Create or link a relative and attach kinship edge from ego person. */
export class CreateAidFamilyMemberDto {
  @IsEnum(AidKinshipRelation)
  relation_type: AidKinshipRelation;

  @IsOptional()
  @IsInt()
  existing_person_id?: number;

  @IsOptional()
  person?: CreateAidPersonDto;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateAidApplicationDto {
  @IsOptional()
  @IsInt()
  beneficiary_person_id?: number;

  @IsOptional()
  @IsInt()
  household_id?: number | null;

  @IsOptional()
  @IsInt()
  writer_person_id?: number;

  @IsOptional()
  @IsEnum(AidWriterRelation)
  writer_relation?: AidWriterRelation;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsString()
  request_summary?: string | null;

  @IsOptional()
  @IsEnum(AidCaseSource)
  case_source?: AidCaseSource | null;

  @IsOptional()
  @IsEnum(AidRequestType)
  requested_aid_type?: AidRequestType;

  /** Program key under aid type (project rates catalog). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  aid_program?: string | null;

  /** Expected amount PKR (lower bound when ranged). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  expected_amount?: number | null;

  /** Expected amount upper bound PKR when program has a range. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  expected_amount_max?: number | null;

  /** Education-aid intake payload (history, scholarship, questions). */
  @IsOptional()
  @IsObject()
  education_details?: Record<string, unknown> | null;

  /** Ration-aid intake payload (persons, wheat, duration, questions). */
  @IsOptional()
  @IsObject()
  ration_details?: Record<string, unknown> | null;

  /** Marriage-gift intake payload (dates, nikah, relation, items). */
  @IsOptional()
  @IsObject()
  marriage_gift_details?: Record<string, unknown> | null;

  /** Financial-assistance intake payload (Financial Condition). */
  @IsOptional()
  @IsObject()
  financial_assistance_details?: Record<string, unknown> | null;

  /** Clean-water intake payload (source, distance, duration, location, contribution). */
  @IsOptional()
  @IsObject()
  clean_water_details?: Record<string, unknown> | null;

  /** Zakat Permission Letter (Urdu/English) — all applications. */
  @IsOptional()
  @IsObject()
  zakat_permission?: Record<string, unknown> | null;

  /** Consent Form (کنسنٹ فارم) — all applications. */
  @IsOptional()
  @IsObject()
  consent_form?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  assigned_to_user_id?: number | null;

  /** Inline create beneficiary when id not known yet */
  @IsOptional()
  beneficiary?: CreateAidPersonDto;

  @IsOptional()
  writer?: CreateAidPersonDto;

  /** Family tree intake: parents, spouse, spouse, guardians linked to beneficiary. */
  @IsOptional()
  family_members?: CreateAidFamilyMemberDto[];
}

export class UpdateAidApplicationDto {
  @IsOptional()
  @IsInt()
  household_id?: number | null;

  @IsOptional()
  @IsInt()
  writer_person_id?: number;

  @IsOptional()
  @IsEnum(AidWriterRelation)
  writer_relation?: AidWriterRelation;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsString()
  request_summary?: string | null;

  @IsOptional()
  @IsEnum(AidCaseSource)
  case_source?: AidCaseSource | null;

  @IsOptional()
  @IsEnum(AidRequestType)
  requested_aid_type?: AidRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  aid_program?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  expected_amount?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  expected_amount_max?: number | null;

  @IsOptional()
  @IsObject()
  education_details?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  ration_details?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  marriage_gift_details?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  financial_assistance_details?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  clean_water_details?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  zakat_permission?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  consent_form?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  assigned_to_user_id?: number | null;

  @IsOptional()
  @IsString()
  verification_notes?: string | null;

  /**
   * Draft investigation progress (no completeness check — use POST :id/verify to submit).
   */
  @IsOptional()
  @IsObject()
  verification_checklist?: Record<string, unknown> | null;

  /** Draft investigator recommendation (saved with checklist progress). */
  @IsOptional()
  @IsObject()
  investigation_recommendation?: Record<string, unknown> | null;

  /** Patch beneficiary person fields (same shape as create person). */
  @IsOptional()
  @IsObject()
  beneficiary?: Record<string, unknown>;

  /** Patch writer person fields when writer_person_id already set. */
  @IsOptional()
  @IsObject()
  writer?: Record<string, unknown>;

  /** Add new family members (existing links are ignored on conflict). */
  @IsOptional()
  family_members?: CreateAidFamilyMemberDto[];
}

export class RejectAidApplicationDto {
  @IsString()
  @MinLength(2)
  rejection_reason: string;
}

/** Approve draft → submitted; must assign a program-department user. */
export class ApproveDraftAidApplicationDto {
  @Type(() => Number)
  @IsInt()
  assigned_to_user_id: number;
}

export class InvestigationRecommendationDto {
  @IsIn(["approve_as_requested", "approve_with_changes", "reject"])
  decision: "approve_as_requested" | "approve_with_changes" | "reject";

  @IsOptional()
  @IsNumber()
  amount?: number | null;

  @IsOptional()
  @IsInt()
  period_months?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  remarks?: string | null;

  /** Optional found monthly income used for after-visit score. */
  @IsOptional()
  @IsNumber()
  found_monthly_income?: number | null;
}

export class VerifyAidApplicationDto {
  @IsOptional()
  @IsString()
  verification_notes?: string | null;

  /**
   * Investigation results by item key.
   * Each value: true | { status: 'verified'|'mismatch'|'not_checked', note?: string }
   * Required claims: verified, or mismatch with Found note (≥3 chars).
   * Process rows: must be verified.
   */
  @IsObject()
  verification_checklist: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Type(() => InvestigationRecommendationDto)
  recommendation?: InvestigationRecommendationDto;

  /** Required when beneficiary/household already received aid this year or within cooldown. */
  @IsOptional()
  @IsString()
  @MinLength(5)
  leakage_override_reason?: string | null;
}

export class CeoDecideAidApplicationDto {
  @IsEnum(AidCeoApprovalStatus)
  decision: AidCeoApprovalStatus.APPROVED | AidCeoApprovalStatus.REJECTED;

  @IsOptional()
  @IsString()
  ceo_rejection_reason?: string | null;

  /** Required on approve when leakage flags are active and not yet overridden. */
  @IsOptional()
  @IsString()
  @MinLength(5)
  leakage_override_reason?: string | null;
}

export class DeliverAidApplicationDto {
  @IsEnum(AidDeliveryStatus)
  delivery_status: AidDeliveryStatus;

  @IsOptional()
  @IsString()
  delivery_notes?: string | null;
}

export class UploadAidAttachmentDto {
  @IsOptional()
  @IsEnum(AidAttachmentContext)
  context?: AidAttachmentContext;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  person_id?: number | null;
}
