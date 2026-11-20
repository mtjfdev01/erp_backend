import { IsNotEmpty, IsDateString, IsString, MinLength } from "class-validator";

export class RequestDueDateExtensionDto {
  @IsNotEmpty({ message: "Proposed new due date is required" })
  @IsDateString({}, { message: "Proposed due date must be a valid date" })
  proposed_due_date: string;

  @IsNotEmpty({ message: "A mandatory reason is required for requesting a due date extension" })
  @IsString()
  @MinLength(5, { message: "Reason must be at least 5 characters long" })
  reason: string;
}
