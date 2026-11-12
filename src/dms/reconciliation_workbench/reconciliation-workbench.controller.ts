import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  Res,
  ValidationPipe,
  UsePipes,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import { ReconciliationWorkbenchService } from "./reconciliation-workbench.service";
import { ReconciliationWorkbenchQueryDto } from "./dto/reconciliation-workbench-query.dto";
import {
  ReconciliationWorkbenchActionDto,
  ReconciliationWorkbenchBulkApproveDto,
} from "./dto/reconciliation-workbench-action.dto";

export const RECONCILIATION_WORKBENCH_ACCESS_GUARD = [
  "super_admin",
  "fund_raising_manager",
  "fund_raising.online_donations.reconciler",
  "fund_raising.offline_donations.reconciler",
  "fund_raising.donation_box_donations.reconciler",
  "fund_raising.recurring_donations.reconciler",
];

@Controller("reconciliation-workbench")
@UseGuards(JwtGuard, PermissionsGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ReconciliationWorkbenchController {
  constructor(
    private readonly workbenchService: ReconciliationWorkbenchService,
  ) {}

  @Get("items")
  @RequiredPermissions(RECONCILIATION_WORKBENCH_ACCESS_GUARD)
  async getItems(
    @Query() query: ReconciliationWorkbenchQueryDto,
    @CurrentUser() currentUser: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.workbenchService.getWorkbenchData(
        query,
        currentUser,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || "Failed to fetch workbench items",
        data: null,
      });
    }
  }

  @Post("approve")
  @RequiredPermissions(RECONCILIATION_WORKBENCH_ACCESS_GUARD)
  async approve(
    @Body() actionDto: ReconciliationWorkbenchActionDto,
    @CurrentUser() currentUser: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.workbenchService.approveItem(
        actionDto,
        currentUser,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (error: any) {
      const status =
        error.status || error.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message || "Failed to approve item",
        data: null,
      });
    }
  }

  @Post("reject")
  @RequiredPermissions(RECONCILIATION_WORKBENCH_ACCESS_GUARD)
  async reject(
    @Body() actionDto: ReconciliationWorkbenchActionDto,
    @CurrentUser() currentUser: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.workbenchService.rejectItem(
        actionDto,
        currentUser,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (error: any) {
      const status =
        error.status || error.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message || "Failed to reject item",
        data: null,
      });
    }
  }

  @Post("bulk-approve")
  @RequiredPermissions(RECONCILIATION_WORKBENCH_ACCESS_GUARD)
  async bulkApprove(
    @Body() bulkDto: ReconciliationWorkbenchBulkApproveDto,
    @CurrentUser() currentUser: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.workbenchService.bulkApprove(
        bulkDto,
        currentUser,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: `Approved ${result.approved} item(s)${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
        data: result,
      });
    } catch (error: any) {
      const status =
        error.status || error.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message || "Failed to bulk approve items",
        data: null,
      });
    }
  }
}
