import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RequiredPermissions } from "./decorators/require-permission.decorator";
import { PermissionRolesService } from "./permission-roles.service";
import { CreatePermissionRoleDto } from "./dto/create-permission-role.dto";
import { UpdatePermissionRoleDto } from "./dto/update-permission-role.dto";

const VIEW_GUARD = [
  "super_admin",
  "permissions.manage.view",
  "permissions.manage.list_view",
  "admin.permission_roles.list_view",
  "admin.permission_roles.view",
];
const CREATE_GUARD = [
  "super_admin",
  "permissions.manage.create",
  "admin.permission_roles.create",
];
const UPDATE_GUARD = [
  "super_admin",
  "permissions.manage.update",
  "admin.permission_roles.update",
];
const DELETE_GUARD = [
  "super_admin",
  "permissions.manage.delete",
  "admin.permission_roles.delete",
];

@Controller("permission-roles")
@UseGuards(JwtGuard, PermissionsGuard)
export class PermissionRolesController {
  constructor(private readonly permissionRolesService: PermissionRolesService) {}

  @Get()
  @RequiredPermissions([...VIEW_GUARD])
  async findAll(
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.permissionRolesService.findAll({
        activeOnly: activeOnly === "true" || activeOnly === "1",
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Permission roles retrieved successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to list permission roles",
        data: [],
      });
    }
  }

  @Get("lookup")
  @RequiredPermissions([...VIEW_GUARD])
  async lookup(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.permissionRolesService.listForLookup({
        search,
        limit: limit ? parseInt(limit, 10) : undefined,
        activeOnly:
          activeOnly === "true" || activeOnly === "1"
            ? true
            : activeOnly === "false" || activeOnly === "0"
              ? false
              : undefined,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Lookup retrieved successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Lookup failed",
        data: [],
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([...VIEW_GUARD])
  async findOne(@Param("id", ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const data = await this.permissionRolesService.findOne(id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Permission role retrieved successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to get permission role",
        data: null,
      });
    }
  }

  @Post()
  @RequiredPermissions([...CREATE_GUARD])
  async create(
    @Body() body: CreatePermissionRoleDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.permissionRolesService.create(body, userId);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Permission role created successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 409 ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to create permission role",
        data: null,
      });
    }
  }

  @Patch(":id")
  @RequiredPermissions([...UPDATE_GUARD])
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdatePermissionRoleDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.permissionRolesService.update(id, body, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Permission role updated successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404
          ? HttpStatus.NOT_FOUND
          : error?.status === 409
            ? HttpStatus.CONFLICT
            : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update permission role",
        data: null,
      });
    }
  }

  @Delete(":id")
  @RequiredPermissions([...DELETE_GUARD])
  async remove(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      await this.permissionRolesService.remove(id, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Permission role archived successfully",
        data: null,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to delete permission role",
        data: null,
      });
    }
  }
}
