import { IsDateString, IsInt, Max, Min } from "class-validator";

export class CreateTaskDueReminderDto {
  @IsDateString()
  remind_on_date: string;

  @IsInt()
  @Min(0)
  @Max(23)
  remind_at_hour: number;
}
