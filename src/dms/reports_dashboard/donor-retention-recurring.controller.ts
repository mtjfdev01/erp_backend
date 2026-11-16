import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { DonorRetentionRecurringService } from "./donor-retention-recurring.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/donor-retention-recurring")
@UseGuards(JwtGuard, PermissionsGuard)
export class DonorRetentionRecurringController {
  constructor(
    private readonly donorRetentionRecurringService: DonorRetentionRecurringService,
  ) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "fund_raising.donor_retention_recurring.view",
    "fund_raising.donor_retention_recurring.list_view",
    "fund_raising.recurring_donations.view",
    "fund_raising.recurring_donations.list_view",
    "fund_raising.recurring_performance.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
    "reconciler",
  ])
  async getOverview(
    @Query("period") period?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.donorRetentionRecurringService.getOverview({
        period,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Donor retention & recurring overview retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message:
          error.message || "Failed to load donor retention & recurring overview",
        data: null,
      });
    }
  }
}
