import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { DonationBoxCollectionMonitorService } from "./donation-box-collection-monitor.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../../permissions/decorators/require-permission.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";

@Controller("donation-box-collections")
@UseGuards(JwtGuard, PermissionsGuard)
export class DonationBoxCollectionMonitorController {
  constructor(
    private readonly monitorService: DonationBoxCollectionMonitorService,
  ) {}

  @Get("monitor")
  @RequiredPermissions([
    "fund_raising.donation_box.view",
    "fund_raising.donation_box.list_view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
    "reconciler",
  ])
  async getMonitorData(
    @Query("city_id") city_id?: string,
    @Query("collector_id") collector_id?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("selected_box_id") selected_box_id?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.monitorService.getCollectionMonitorData({
        city_id,
        collector_id,
        status,
        search,
        selected_box_id,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Donation box collection monitor data retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to load collection monitor data",
        data: null,
      });
    }
  }

  @Post("monitor/mark-reviewed/:id")
  @RequiredPermissions([
    "fund_raising.donation_box.update",
    "fund_raising.donation_box.view",
    "super_admin",
    "fund_raising_manager",
    "reconciler",
  ])
  async markReviewed(
    @Param("id") id: string,
    @Body("notes") notes: string,
    @CurrentUser() currentUser: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.monitorService.markReviewed(
        +id,
        currentUser,
        notes,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to mark as reviewed",
      });
    }
  }

  @Post("monitor/assign-collector/:id")
  @RequiredPermissions([
    "fund_raising.donation_box.update",
    "super_admin",
    "fund_raising_manager",
    "reconciler",
  ])
  async assignCollector(
    @Param("id") id: string,
    @Body("collector_id") collector_id: number,
    @CurrentUser() currentUser: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.monitorService.assignCollector(
        +id,
        +collector_id,
        currentUser,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to assign collector",
      });
    }
  }
}
