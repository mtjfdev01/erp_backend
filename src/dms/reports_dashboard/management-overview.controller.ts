import {
  Controller,
  Get,
  Query,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { ManagementOverviewService } from "./management-overview.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/management-overview")
@UseGuards(JwtGuard, PermissionsGuard)
export class ManagementOverviewController {
  constructor(
    private readonly managementOverviewService: ManagementOverviewService,
  ) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "fund_raising.management_overview.view",
    "fund_raising.management_overview.list_view",
    "fund_raising.reports_dashboard.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
    "reconciler",
  ])
  async getOverview(
    @Query("period") period?: string,
    @Query("project") project?: string,
    @Query("office") office?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.managementOverviewService.getOverview({
        period,
        project,
        office,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Management overview retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to load management overview",
        data: null,
      });
    }
  }
}
