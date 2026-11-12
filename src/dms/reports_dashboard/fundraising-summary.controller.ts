import {
  Controller,
  Get,
  Query,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { FundraisingSummaryService } from "./fundraising-summary.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/fundraising-summary")
@UseGuards(JwtGuard, PermissionsGuard)
export class FundraisingSummaryController {
  constructor(
    private readonly fundraisingSummaryService: FundraisingSummaryService,
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
  async getSummary(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("channel") channel?: string,
    @Query("fund_type") fund_type?: string,
    @Query("project") project?: string,
    @Query("city") city?: string,
    @Query("collected_by") collected_by?: string,
    @Query("group_by") group_by?: "channel" | "fund_type" | "city" | "collected_by",
    @Res() res?: Response,
  ) {
    try {
      const data = await this.fundraisingSummaryService.getSummary({
        from,
        to,
        channel,
        fund_type,
        project,
        city,
        collected_by,
        group_by,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Fundraising summary retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to load fundraising summary",
        data: null,
      });
    }
  }
}
