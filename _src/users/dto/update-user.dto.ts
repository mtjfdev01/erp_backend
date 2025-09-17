import { IsString, IsEmail, IsOptional, IsEnum, IsDateString, Length } from 'class-validator';
import { UserRole, Department } from '../user.entity';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @Length(11, 11)
  @IsOptional()
  phone?: string;

  @IsDateString()
  @IsOptional()
  dob?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @Length(13, 13)
  @IsOptional()
  cnic?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(Department)
  @IsOptional()
  department?: Department;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsDateString()
  @IsOptional()
  joining_date?: string;

  @IsString()
  @IsOptional()
  emergency_contact?: string;

  @IsString()
  @IsOptional()
  blood_group?: string;

  @IsString()
  @IsOptional()
  password?: string;
} 