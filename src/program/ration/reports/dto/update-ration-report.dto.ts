import { IsDate, IsBoolean, IsNumber, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRationReportDto {
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  report_date?: Date;

  @IsBoolean()
  @IsOptional()
  is_alternate?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  full_widows?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  full_divorced?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  full_disable?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  full_indegent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  full_orphan?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  half_widows?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  half_divorced?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  half_disable?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  half_indegent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  half_orphan?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  life_time?: number;
} 