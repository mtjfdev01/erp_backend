import { Transform } from "class-transformer";
import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsUrl,
  IsBoolean,
  IsArray,
  IsObject,
  IsEnum,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApplicationStatus } from "../entities/application.entity";

function parseJsonField({ value }: { value: unknown }) {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function toOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return undefined;
}

function toOptionalNumber({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export class CreateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  /** Legacy / convenience — used if first/last not sent. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  applicant_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  father_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  disability?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  marital_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  husband_name?: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  office_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  residence_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  postal_code?: string;

  @IsOptional()
  @IsString()
  current_address?: string;

  @IsOptional()
  @IsString()
  permanent_address?: string;

  @IsOptional()
  @Transform(parseJsonField)
  @IsArray()
  education?: Record<string, any>[];

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  has_work_experience?: boolean;

  @IsOptional()
  @Transform(parseJsonField)
  @IsArray()
  experience?: Record<string, any>[];

  @IsOptional()
  @Transform(parseJsonField)
  @IsObject()
  disclosure?: Record<string, any>;

  @IsOptional()
  @IsUrl()
  @MaxLength(1000)
  resume_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resume_file_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  original_filename?: string;

  @IsOptional()
  @IsString()
  cover_letter?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  job_id?: number;
}
