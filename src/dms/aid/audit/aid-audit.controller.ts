import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "../../../auth/jwt.guard";
import { RequiredPermissions } from "../../../permissions/decorators/require-permission.decorator";
import { PermissionsGuard } from "../../../permissions/guards/permissions.guard";
import {
  AID_AUDIT_LIST_GUARD,
  AID_AUDIT_VIEW_GUARD,
} from "../../../permissions/aid-permissions.constants";
import { AidApplicationsService } from "../aid-applications.service";
import { AidAuditService } from "./aid-audit.service";

/**
 * Separate Aid audit screens — not embedded on application view.
 * Requires program.aid_audit.list_view / view (super_admin also allowed).
 */
@Controller("aid/audit")
@UseGuards(JwtGuard, PermissionsGuard)
export class AidAuditController {
  constructor(
    private readonly auditService: AidAuditService,
    private readonly applicationsService: AidApplicationsService,
  ) {}

  @Get("applications")
  @RequiredPermissions([...AID_AUDIT_LIST_GUARD])
  async listApplications(
    @Query("search") search: string,
    @Query("status") status: string,
    @Query("stage") stage: string,
    @Query("requested_aid_type") requested_aid_type: string,
    @Query("district") district: string,
    @Query("assigned_to_user_id") assigned_to_user_id: string,
    @Query("queue") queue: string,
    @Query("page") page: string,
    @Query("pageSize") pageSize: string,
    @Query("sortField") sortField: string,
    @Query("sortOrder") sortOrder: string,
    @Res() res: Response,
  ) {
    const result = await this.applicationsService.findAll({
      search,
      status,
      stage,
      requested_aid_type,
      district,
      assigned_to_user_id,
      queue,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      sortField: sortField || "updated_at",
      sortOrder: sortOrder || "DESC",
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Aid audit application list retrieved",
      ...result,
    });
  }

  @Get("applications/:id")
  @RequiredPermissions([...AID_AUDIT_VIEW_GUARD])
  async getApplication(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const data = await this.auditService.getApplicationSummary(Number(id));
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Aid audit application summary retrieved",
      data,
    });
  }

  @Get("applications/:id/history")
  @RequiredPermissions([...AID_AUDIT_VIEW_GUARD])
  async getHistory(@Param("id") id: string, @Res() res: Response) {
    const appId = Number(id);
    // Ensure application exists (404) before returning empty history
    await this.auditService.getApplicationSummary(appId);
    const data = await this.auditService.findByApplicationId(appId);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Aid application audit history retrieved",
      data,
    });
  }
}
