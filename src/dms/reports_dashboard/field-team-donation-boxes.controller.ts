import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { FieldTeamDonationBoxesService } from "./field-team-donation-boxes.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/field-team-donation-boxes")
@UseGuards(JwtGuard, PermissionsGuard)
export class FieldTeamDonationBoxesController {
  constructor(
    private readonly fieldTeamDonationBoxesService: FieldTeamDonationBoxesService,
  ) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "fund_raising.field_team_donation_boxes.view",
    "fund_raising.field_team_donation_boxes.list_view",
    "fund_raising.donation_box.view",
    "fund_raising.donation_box.list_view",
    "fund_raising.donation_box_donations.view",
    "fund_raising.donation_box_donations.list_view",
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
      const data = await this.fieldTeamDonationBoxesService.getOverview({
        period,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Field team & donation boxes overview retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message:
          error.message || "Failed to load field team & donation boxes overview",
        data: null,
      });
    }
  }
}
