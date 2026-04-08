import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWorkflowTemplateDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  program_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

