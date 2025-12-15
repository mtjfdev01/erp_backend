import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApplicationStatus } from '../entities/job-application.entity';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus, {
    message: 'Status must be pending, reviewed, shortlisted, rejected, or hired',
  })
  @IsOptional()
  status?: ApplicationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

