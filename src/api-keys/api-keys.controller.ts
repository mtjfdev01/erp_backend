import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "../auth/jwt.guard";
import { RequiredPermissions } from "../permissions/decorators/require-permission.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { API_KEY_SCOPES } from "./api-keys.constants";
import { ApiKeysService } from "./api-keys.service";

/**
 * Staff CRUD for integration API keys (`api_keys` table).
 * Full secret returned only on create.
 *
 * Legacy donation partner keys remain under `/external/api-keys`.
 */
@Controller("api-keys")
@UseGuards(JwtGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private readonly keysService: ApiKeysService) {}

  @Get("scopes")
  @RequiredPermissions(["super_admin", "program_manager", "fund_raising_manager"])
  async listScopes(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Available API key scopes",
      data: Object.values(API_KEY_SCOPES),
    });
  }

  @Get()
  @RequiredPermissions(["super_admin", "program_manager", "fund_raising_manager"])
  async list(@Res() res: Response) {
    const data = await this.keysService.list();
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "API keys fetched",
      data,
    });
  }

  @Post()
  @RequiredPermissions(["super_admin", "program_manager", "fund_raising_manager"])
  async create(
    @Body()
    body: {
      name: string;
      scopes?: string[];
      notes?: string;
      api_key?: string;
    },
    @Res() res: Response,
  ) {
    try {
      const data = await this.keysService.create(body);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message:
          "API key created. Copy api_key now — it is not shown again in list.",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to create API key",
        data: null,
      });
    }
  }

  @Patch(":id")
  @RequiredPermissions(["super_admin", "program_manager", "fund_raising_manager"])
  async update(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      scopes?: string[] | null;
      notes?: string | null;
      is_active?: boolean;
    },
    @Res() res: Response,
  ) {
    try {
      const data = await this.keysService.update(Number(id), body);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "API key updated",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update API key",
        data: null,
      });
    }
  }

  @Delete(":id")
  @RequiredPermissions(["super_admin", "program_manager", "fund_raising_manager"])
  async revoke(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.keysService.revoke(Number(id));
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "API key revoked",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to revoke API key",
        data: null,
      });
    }
  }
}
