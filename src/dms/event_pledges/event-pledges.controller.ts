import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { EventPledgesService } from "./event-pledges.service";
import { CreateEventPledgeDto } from "./dto/create-event-pledge.dto";
import { UpdateEventPledgeDto } from "./dto/update-event-pledge.dto";

@Controller("dms/event-pledges")
@UseGuards(JwtGuard, PermissionsGuard)
export class EventPledgesController {
  constructor(private readonly pledgesService: EventPledgesService) {}

  @Post()
  @RequiredPermissions([
    "fund_raising.event_pledges.create",
    "super_admin",
    "fund_raising_manager",
  ])
  async create(
    @Body() dto: CreateEventPledgeDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.pledgesService.create(dto, req.user?.id);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Event pledge created successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to create event pledge",
        data: null,
      });
    }
  }

  @Get()
  @RequiredPermissions([
    "fund_raising.event_pledges.list_view",
    "fund_raising.event_pledges.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async findAll(@Query() query: Record<string, any>, @Res() res: Response) {
    try {
      const result = await this.pledgesService.findAll(query);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Event pledges fetched successfully",
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        },
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to fetch event pledges",
        data: [],
        pagination: null,
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([
    "fund_raising.event_pledges.view",
    "fund_raising.event_pledges.list_view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.pledgesService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Event pledge fetched successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to fetch event pledge",
        data: null,
      });
    }
  }

  @Patch(":id")
  @RequiredPermissions([
    "fund_raising.event_pledges.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateEventPledgeDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.pledgesService.update(+id, dto, req.user?.id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Event pledge updated successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update event pledge",
        data: null,
      });
    }
  }

  @Delete(":id")
  @RequiredPermissions([
    "fund_raising.event_pledges.delete",
    "super_admin",
    "fund_raising_manager",
  ])
  async remove(
    @Param("id") id: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      await this.pledgesService.remove(+id, req.user?.id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Event pledge deleted successfully",
        data: null,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to delete event pledge",
        data: null,
      });
    }
  }
}
