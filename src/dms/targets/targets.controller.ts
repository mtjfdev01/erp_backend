import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { CreateUserTargetDto } from "./dto/create-user-target.dto";
import { UpdateUserTargetDto } from "./dto/update-user-target.dto";
import { TargetsService } from "./targets.service";

@Controller("dms/targets")
@UseGuards(JwtGuard, PermissionsGuard)
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  @RequiredPermissions([
    "fund_raising.targets.create",
    "super_admin",
    "fund_raising_manager",
  ])
  async create(
    @Body() dto: CreateUserTargetDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.targetsService.create(dto, req.user?.id);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Target assigned successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status ||
        (String(error?.message || "").includes("already exists")
          ? HttpStatus.CONFLICT
          : HttpStatus.BAD_REQUEST);
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to create target",
        data: null,
      });
    }
  }

  @Get()
  @RequiredPermissions([
    "fund_raising.targets.list_view",
    "fund_raising.targets.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async findAll(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("user_id") user_id?: string,
    @Query("target_type") target_type?: string,
    @Query("period_year") period_year?: string,
    @Query("period_month") period_month?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.targetsService.findAll({
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
        search,
        user_id: user_id ? parseInt(user_id, 10) : undefined,
        target_type,
        period_year: period_year ? parseInt(period_year, 10) : undefined,
        period_month: period_month ? parseInt(period_month, 10) : undefined,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Targets retrieved successfully",
        ...data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to load targets",
        data: [],
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([
    "fund_raising.targets.view",
    "fund_raising.targets.list_view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.targetsService.findOne(parseInt(id, 10));
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Target retrieved successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: error?.message || "Target not found",
        data: null,
      });
    }
  }

  @Patch(":id")
  @RequiredPermissions([
    "fund_raising.targets.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserTargetDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.targetsService.update(
        parseInt(id, 10),
        dto,
        req.user?.id,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Target updated successfully",
        data,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update target",
        data: null,
      });
    }
  }

  @Delete(":id")
  @RequiredPermissions([
    "fund_raising.targets.delete",
    "super_admin",
    "fund_raising_manager",
  ])
  async remove(
    @Param("id") id: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.targetsService.remove(
        parseInt(id, 10),
        req.user?.id,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Target removed successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to remove target",
        data: null,
      });
    }
  }
}
