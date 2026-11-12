import {
  Controller,
  Get,
  Query,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { ReportsDashboardService } from "./reports-dashboard.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/reports-dashboard")
@UseGuards(JwtGuard, PermissionsGuard)
export class ReportsDashboardController {
  constructor(
    private readonly reportsDashboardService: ReportsDashboardService,
  ) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
    "reconciler",
  ])
  async getDashboard(
    @Query("period") period?: string,
    @Query("fund_type") fund_type?: string,
    @Query("basis") basis?: string,
    @Query("start_date") start_date?: string,
    @Query("end_date") end_date?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.reportsDashboardService.getReportsDashboard({
        period,
        fund_type,
        basis,
        start_date,
        end_date,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reports dashboard data retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to load reports dashboard",
        data: null,
      });
    }
  }
}
