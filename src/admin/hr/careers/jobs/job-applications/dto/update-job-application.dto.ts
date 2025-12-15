import { PartialType } from '@nestjs/mapped-types';
import { CreateJobApplicationDto } from './create-job-application.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApplicationStatus } from '../entities/job-application.entity';

export class UpdateJobApplicationDto extends PartialType(CreateJobApplicationDto) {
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

