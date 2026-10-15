import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "../../auth/jwt.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { AID_APPLICATIONS_LIST_GUARD } from "../../permissions/aid-permissions.constants";
import { AidOverviewService } from "./aid-overview.service";

@Controller("aid/overview")
@UseGuards(JwtGuard, PermissionsGuard)
export class AidOverviewController {
  constructor(private readonly overviewService: AidOverviewService) {}

  @Get()
  @RequiredPermissions([...AID_APPLICATIONS_LIST_GUARD])
  async overview(
    @Query("period") period: string,
    @Query("program") program: string,
    @Query("district") district: string,
    @Res() res: Response,
  ) {
    const data = await this.overviewService.getOverview({
      period,
      program,
      district,
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Welfare overview retrieved",
      data,
    });
  }
}
