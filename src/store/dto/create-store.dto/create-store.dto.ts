import { IsDate, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateStoreDto {
  @IsDate()
  @IsNotEmpty()
  date: Date;

  @IsNumber()
  @IsNotEmpty()
  demandGenerated: number;

  @IsNumber()
  @IsNotEmpty()
  pendingDemands: number;

  @IsNumber()
  @IsNotEmpty()
  generatedGRN: number;

  @IsNumber()
  @IsNotEmpty()
  pendingGRN: number;

  @IsNumber()
  @IsNotEmpty()
  rejectedDemands: number;
}
