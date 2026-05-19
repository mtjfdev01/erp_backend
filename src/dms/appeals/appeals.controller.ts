import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { AppealsService } from "./appeals.service";
import { CreateAppealDto } from "./dto/create-appeal.dto";
import { UpdateAppealDto } from "./dto/update-appeal.dto";
import { AppealFiltersDto } from "./dto/appeal-filters.dto";
import { SetAppealStatusDto } from "./dto/set-status.dto";
import { ConditionalJwtGuard } from "../../auth/guards/conditional-jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions";

@Controller("appeals")
export class AppealsController {
  constructor(private readonly appealsService: AppealsService) {}

  @Post()
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.appeals.create", "fund_raising.appeals.create", "super_admin"])
  async create(
    @Body() dto: CreateAppealDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id ?? null;
      const result = await this.appealsService.create(dto, userId);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Appeal created successfully",
        data: result,
      });
    } catch (error: any) {
      const status = error.message?.includes("not found")
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Get()
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.appeals.list_view", "fund_raising.appeals.list_view", "super_admin"])
  async findAll(@Query() filters: AppealFiltersDto, @Res() res: Response) {
    try {
      const result = await this.appealsService.findAll(filters);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Appeals retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  @Get(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.appeals.view", "fund_raising.appeals.view", "super_admin"])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const result = await this.appealsService.findByIdOrSlug(id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Appeal retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      const status = error.message?.includes("not found")
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Patch(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.appeals.update", "fund_raising.appeals.update", "super_admin"])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateAppealDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id ?? null;
      const result = await this.appealsService.update(+id, dto, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Appeal updated successfully",
        data: result,
      });
    } catch (error: any) {
      const status = error.message?.includes("not found")
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Patch(":id/status")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.appeals.update", "fund_raising.appeals.update", "super_admin"])
  async setStatus(
    @Param("id") id: string,
    @Body() dto: SetAppealStatusDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id ?? null;
      const result = await this.appealsService.setStatus(
        +id,
        dto.status,
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Appeal status updated",
        data: result,
      });
    } catch (error: any) {
      const status = error.message?.includes("not found")
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Delete(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.appeals.delete", "fund_raising.appeals.delete", "super_admin"])
  async archive(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    try {
      const userId = req?.user?.id ?? null;
      await this.appealsService.archive(+id, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Appeal archived successfully",
        data: null,
      });
    } catch (error: any) {
      const status = error.message?.includes("not found")
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }
}
