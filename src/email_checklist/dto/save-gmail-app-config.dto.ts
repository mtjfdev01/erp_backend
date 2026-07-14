import { IsString, MaxLength, MinLength, IsOptional } from "class-validator";

export class SaveGmailAppConfigDto {
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  client_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  client_secret?: string;
}
