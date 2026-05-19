import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Length } from "class-validator";

export class ProcessAlfalahOtpDto {
  @Type(() => Number)
  @IsInt()
  donationId: number;

  /** Alfa Wallet — 8-digit SMS OTP (when IsOTP was true). */
  @IsOptional()
  @IsString()
  @Length(8, 8)
  smsOtp?: string;

  /** Alfalah account — 4-char SMS OTAC (when IsOTP was false). */
  @IsOptional()
  @IsString()
  @Length(4, 4)
  smsOtac?: string;

  /** Alfalah account — 4-char email OTAC. */
  @IsOptional()
  @IsString()
  @Length(4, 4)
  emailOtac?: string;
}
