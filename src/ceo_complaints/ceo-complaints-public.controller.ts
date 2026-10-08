import {
  Controller,
  Post,
  Body,
  HttpStatus,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Response } from "express";
import { CeoComplaintsService } from "./ceo-complaints.service";
import { CreateCeoComplaintDto } from "./dto/create-ceo-complaint.dto";
import { TrackCeoComplaintDto } from "./dto/track-ceo-complaint.dto";
import { OriginAllowlistGuard } from "./guards/origin-allowlist.guard";

const dtoPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
});

@Controller("ceo-complaints/public")
@UseGuards(OriginAllowlistGuard)
export class CeoComplaintsPublicController {
  constructor(private readonly service: CeoComplaintsService) {}

  @Post("submit")
  @UsePipes(dtoPipe)
  async submit(@Body() dto: CreateCeoComplaintDto, @Res() res: Response) {
    try {
      const data = await this.service.createPublic(dto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Complaint submitted successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status || error?.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to submit complaint",
        data: null,
      });
    }
  }

  @Post("track")
  @UsePipes(dtoPipe)
  async track(@Body() dto: TrackCeoComplaintDto, @Res() res: Response) {
    try {
      const data = await this.service.trackByNumber(dto.complaint_number);
      return res.status(HttpStatus.OK).json({
        success: true,
        data,
      });
    } catch (error: any) {
      const status =
        error?.status || error?.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to track complaint",
        data: null,
      });
    }
  }
}
