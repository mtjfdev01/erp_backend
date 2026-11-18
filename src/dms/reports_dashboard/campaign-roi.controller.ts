import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { CampaignRoiService } from "./campaign-roi.service";

@Controller("dms/campaign-roi")
@UseGuards(JwtGuard, PermissionsGuard)
export class CampaignRoiController {
  constructor(private readonly campaignRoiService: CampaignRoiService) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "dms.campaigns.view",
    "dms.campaigns.list_view",
    "super_admin",
    "fund_raising_manager",
  ])
  async getOverview(
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.campaignRoiService.getOverview({
        period,
        from,
        to,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign ROI retrieved successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to load Campaign ROI",
        data: null,
      });
    }
  }
}
