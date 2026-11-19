import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ArrayMinSize,
} from "class-validator";
import { UploadPostStatus } from "../entities/upload-post.entity";

export class CreateUploadPostDto {
  @IsOptional()
  @IsInt()
  campaign_id?: number;

  @IsOptional()
  @IsInt()
  appeal_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  upload_post_user?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  platforms?: string[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  photo_urls?: string[];

  /** Convenience single-image field; merged into photo_urls. */
  @IsOptional()
  @IsUrl()
  @MaxLength(1000)
  image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  facebook_page_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  target_linkedin_page_id?: string;

  @IsOptional()
  @IsString()
  first_comment?: string;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @IsOptional()
  @IsEnum(UploadPostStatus)
  status?: UploadPostStatus;

  /** When true, push to Upload-Post immediately after save. */
  @IsOptional()
  @IsBoolean()
  publish_to_upload_post?: boolean;
}
