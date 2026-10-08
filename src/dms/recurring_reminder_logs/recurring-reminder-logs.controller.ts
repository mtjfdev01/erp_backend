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
import { PermissionsGuard } from "src/permissions/guards/permissions.guard";
import { RequiredPermissions } from "src/permissions/decorators/require-permission.decorator";
import {
  RECURRING_REMINDER_LOG_LIST_VIEW_GUARD,
  RECURRING_REMINDER_LOG_VIEW_GUARD,
} from "src/permissions/recurring-reminder-logs-permissions.constants";
import { RecurringReminderLogsService } from "./recurring-reminder-logs.service";

@Controller("recurring-reminder-logs")
@UseGuards(JwtGuard, PermissionsGuard)
export class RecurringReminderLogsController {
  constructor(private readonly logsService: RecurringReminderLogsService) {}

  @Post("search")
  @RequiredPermissions([...RECURRING_REMINDER_LOG_LIST_VIEW_GUARD])
  async search(@Body() payload: Record<string, any>, @Res() res: Response) {
    try {
      const result = await this.logsService.search(payload || {});
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reminder logs fetched successfully",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to fetch reminder logs",
        data: [],
        pagination: null,
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([...RECURRING_REMINDER_LOG_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.logsService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reminder log fetched successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to fetch reminder log",
        data: null,
      });
    }
  }
}
