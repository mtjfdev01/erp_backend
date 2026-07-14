import { IsBoolean } from "class-validator";

export class ToggleChecklistItemDto {
  @IsBoolean()
  is_done: boolean;
}
