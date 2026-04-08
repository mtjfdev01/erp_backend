import { IsBoolean, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { ParentEntityType } from '../../common/progress-tracking.enum';

export class CreateTrackerDto {
  @IsNumber()
  template_id: number;

  @IsOptional()
  @IsNumber()
  donation_id?: number | null;

  @IsOptional()
  @IsEnum(ParentEntityType)
  parent_type?: ParentEntityType;

  @IsOptional()
  @IsNumber()
  parent_id?: number | null;

  @IsOptional()
  @IsBoolean()
  donor_visible?: boolean;
}

