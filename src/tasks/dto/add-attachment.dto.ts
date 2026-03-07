import { IsString } from "class-validator";

export class AddAttachmentDto {
  @IsString()
  file_name: string;

  @IsString()
  file_url: string;

  @IsString()
  file_type: string;
}
