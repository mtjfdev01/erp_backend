import {
  Controller,
  Post,
  Body,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { ComplaintCaseService } from "./complaint-case.service";
import { TrackComplaintDto } from "./dto/track-complaint.dto";

/**
 * Public endpoints for future website integration.
 * No auth — complainant tracks status by reference code only.
 */
@Controller("tickets/case/public")
export class ComplaintCasePublicController {
  constructor(private readonly complaintCaseService: ComplaintCaseService) {}

  @Post("track")
  async trackByCode(@Body() dto: TrackComplaintDto, @Res() res: Response) {
    const result = await this.complaintCaseService.trackByCode(dto.code);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }
}
