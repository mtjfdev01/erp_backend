import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { DonorProfilesDemographicsService } from "./donor-profiles-demographics.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/donor-profiles-demographics")
@UseGuards(JwtGuard, PermissionsGuard)
export class DonorProfilesDemographicsController {
  constructor(
    private readonly donorProfilesDemographicsService: DonorProfilesDemographicsService,
  ) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "fund_raising.donor_profiles_demographics.view",
    "fund_raising.donor_profiles_demographics.list_view",
    "fund_raising.donors.view",
    "fund_raising.donors.list_view",
    "super_admin",
    "fund_raising_manager",
  ])
  async getOverview(
    @Query("period") period?: string,
    @Query("donor_type") donor_type?: string,
    @Query("top_limit") top_limit?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.donorProfilesDemographicsService.getOverview({
        period,
        donor_type,
        top_limit: top_limit ? Number(top_limit) : undefined,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Donor profiles & demographics retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message:
          error.message || "Failed to load donor profiles & demographics",
        data: null,
      });
    }
  }
}
