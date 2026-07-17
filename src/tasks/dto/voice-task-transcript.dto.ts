import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export type VoiceTaskOutputLanguage = "ur" | "en";

export class VoiceKnownUserDto {
  @IsInt()
  id: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
}

export class VoiceTaskTranscriptDto {
  @IsString()
  @IsNotEmpty()
  transcript: string;

  /** Title and description output language: ur (Urdu) or en (English). */
  @IsOptional()
  @IsString()
  @IsIn(["ur", "en"])
  output_language?: VoiceTaskOutputLanguage;

  /** Cached roster from frontend for accurate assignee name matching. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoiceKnownUserDto)
  known_users?: VoiceKnownUserDto[];
}
