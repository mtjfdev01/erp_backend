import { IsNotEmpty, IsString } from "class-validator";

export class VoiceTaskTranscriptDto {
  @IsString()
  @IsNotEmpty()
  transcript: string;
}
