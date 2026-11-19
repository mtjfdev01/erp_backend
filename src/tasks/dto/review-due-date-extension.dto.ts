import { IsNotEmpty, IsIn, IsOptional, IsString, IsInt } from "class-validator";

export class ReviewDueDateExtensionDto {
  @IsOptional()
  @IsInt()
  extension_id?: number;

  @IsNotEmpty({ message: "Decision is required ('approved' or 'rejected')" })
  @IsIn(["approved", "rejected"], { message: "Decision must be 'approved' or 'rejected'" })
  decision: "approved" | "rejected";

  @IsOptional()
  @IsString()
  note?: string;
}
