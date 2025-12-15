import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsBoolean,
  IsNumber,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';

export class CreateJobApplicationDto {
  @IsNumber()
  @IsNotEmpty({ message: 'Job ID is required' })
  job_id: number;

  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(255, { message: 'Full name must not exceed 255 characters' })
  @Matches(/^[a-zA-Z\s]+$/, { message: 'Full name must contain only letters and spaces' })
  full_name: string;

  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone is required' })
  @MaxLength(20, { message: 'Phone must not exceed 20 characters' })
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone must be in valid international format' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Cover letter is required' })
  @MinLength(50, { message: 'Cover letter must be at least 50 characters' })
  @MaxLength(5000, { message: 'Cover letter must not exceed 5000 characters' })
  cover_letter: string;

  @IsString()
  @IsNotEmpty({ message: 'CV/Resume file is required' })
  cv_resume: string; // File path/URL after upload

  @IsBoolean()
  @IsNotEmpty({ message: 'Consent is required' })
  consent: boolean;
}

