import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { EventPledgesService } from "./event-pledges.service";
import { CreateEventPledgeDto } from "./dto/create-event-pledge.dto";

/**
 * Public create for website donors (no JWT).
 * Staff CRUD remains on EventPledgesController with auth + permissions.
 */
@Controller("public/event-pledges")
export class PublicEventPledgesController {
  constructor(private readonly pledgesService: EventPledgesService) {}

  @Post()
  async create(@Body() dto: CreateEventPledgeDto, @Res() res: Response) {
    try {
      const data = await this.pledgesService.create(dto, null);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Pledge submitted successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to submit pledge",
        data: null,
      });
    }
  }
}
