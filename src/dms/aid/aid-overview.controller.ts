import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "../../auth/jwt.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { AID_OVERVIEW_VIEW_GUARD } from "../../permissions/aid-permissions.constants";
import { AidOverviewService } from "./aid-overview.service";

@Controller("aid/overview")
@UseGuards(JwtGuard, PermissionsGuard)
export class AidOverviewController {
  constructor(private readonly overviewService: AidOverviewService) {}

  @Get()
  @RequiredPermissions([...AID_OVERVIEW_VIEW_GUARD])
  async overview(
    @Query("date") date: string,
    @Query("start_date") startDate: string,
    @Query("end_date") endDate: string,
    @Query("program") program: string,
    @Res() res: Response,
  ) {
    const data = await this.overviewService.getOverview({
      date,
      start_date: startDate,
      end_date: endDate,
      program,
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Welfare overview retrieved",
      data,
    });
  }
}
