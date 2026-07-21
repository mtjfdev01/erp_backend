import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { RecurringDonationsLedgerService } from "./recurring-donations-ledger.service";
import {
  RECURRING_DONATION_LIST_VIEW_GUARD,
  RECURRING_DONATION_VIEW_GUARD,
} from "../../permissions/recurring-donations-permissions.constants";

@Controller("recurring-donations")
@UseGuards(JwtGuard, PermissionsGuard)
export class RecurringDonationsController {
  constructor(
    private readonly ledgerService: RecurringDonationsLedgerService,
  ) {}

  @Post("search")
  @RequiredPermissions([...RECURRING_DONATION_LIST_VIEW_GUARD])
  async search(@Body() payload: Record<string, any>, @Res() res: Response) {
    try {
      const result = await this.ledgerService.search(payload);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Recurring donations fetched successfully",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to fetch recurring donations",
        data: [],
        pagination: null,
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([...RECURRING_DONATION_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.ledgerService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Recurring donation fetched successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to fetch recurring donation",
        data: null,
      });
    }
  }
}
