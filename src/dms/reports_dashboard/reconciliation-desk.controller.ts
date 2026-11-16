import {
  Controller,
  Get,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { ReconciliationDeskService } from "./reconciliation-desk.service";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";

@Controller("dms/reconciliation-desk")
@UseGuards(JwtGuard, PermissionsGuard)
export class ReconciliationDeskController {
  constructor(
    private readonly reconciliationDeskService: ReconciliationDeskService,
  ) {}

  @Get()
  @RequiredPermissions([
    "fund_raising.reports.view",
    "fund_raising.dashboard.view",
    "fund_raising.reconciliation_desk.view",
    "fund_raising.reconciliation_desk.list_view",
    "fund_raising.reconciliation.view",
    "fund_raising.reconciliation_workbench.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
    "reconciler",
  ])
  async getDesk(@Res() res?: Response) {
    try {
      const data = await this.reconciliationDeskService.getDesk();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reconciliation desk retrieved successfully",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to load reconciliation desk",
        data: null,
      });
    }
  }
}
