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
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "src/permissions/guards/permissions.guard";
import { RequiredPermissions } from "src/permissions/decorators/require-permission.decorator";
import { ReportingHierarchyService } from "./reporting-hierarchy.service";
import { CreateReportingEdgeDto } from "./dto/create-reporting-edge.dto";
import { UpdateReportingEdgeDto } from "./dto/update-reporting-edge.dto";
import { SetUserManagersDto } from "./dto/set-user-managers.dto";

const importUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
};

/**
 * Standalone Reporting Hierarchy CRUD.
 * Does not alter PermissionsGuard behaviour for other modules,
 * nor sync into users.manager_id / user_managers.
 */
const VIEW = [
  "super_admin",
  "admin.reporting_hierarchy.list_view",
  "admin.reporting_hierarchy.view",
];
const CREATE = ["super_admin", "admin.reporting_hierarchy.create"];
const UPDATE = ["super_admin", "admin.reporting_hierarchy.update"];
const DELETE = ["super_admin", "admin.reporting_hierarchy.delete"];

@Controller("reporting-hierarchy")
@UseGuards(JwtGuard, PermissionsGuard)
export class ReportingHierarchyController {
  constructor(private readonly service: ReportingHierarchyService) {}

  @Get("organogram")
  @RequiredPermissions([...VIEW])
  async organogram(
    @Query("department") department?: string,
    @Query("mode") mode?: string,
    @Query("root_user_id") root_user_id?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.service.getOrganogram({
        department,
        mode: mode === "all" ? "all" : "primary",
        root_user_id: root_user_id ? parseInt(root_user_id, 10) : undefined,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Employee organogram retrieved",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to load organogram",
        data: null,
      });
    }
  }

  @Get("import/template")
  @RequiredPermissions([...VIEW])
  async downloadImportTemplate(@Res() res: Response) {
    try {
      const buffer = this.service.buildImportTemplateBuffer();
      const meta = this.service.getImportTemplateMeta();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${meta.filename}"`,
      );
      return res.status(HttpStatus.OK).send(buffer);
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to build template",
        data: null,
      });
    }
  }

  @Get("import/format")
  @RequiredPermissions([...VIEW])
  async importFormat(@Res() res: Response) {
    try {
      const data = this.service.getImportTemplateMeta();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Import format specification",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to load format",
        data: null,
      });
    }
  }

  @Post("import")
  @RequiredPermissions([...CREATE])
  @UseInterceptors(FileInterceptor("file", importUpload))
  async importHierarchy(
    @UploadedFile() file: Express.Multer.File,
    @Query("dry_run") dry_run?: string,
    @Req() req?: any,
    @Res() res?: Response,
  ) {
    try {
      if (!file) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: "Upload a .xlsx or .csv file as field \"file\"",
          data: null,
        });
      }
      const actorId = req?.user?.id > 0 ? req.user.id : null;
      const dryRun =
        dry_run === "1" ||
        dry_run === "true" ||
        String(dry_run || "").toLowerCase() === "yes";
      const data = await this.service.importHierarchyFile(file, {
        dryRun,
        actorId,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: dryRun
          ? "Dry run complete — no changes written"
          : "Import complete",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to import hierarchy",
        data: null,
      });
    }
  }

  @Get("people")
  @RequiredPermissions([...VIEW])
  async listPeople(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("department") department?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.service.listPeople({
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
        search,
        department,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "People with reporting summary",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to list people",
        data: null,
      });
    }
  }

  @Get("people/:userId")
  @RequiredPermissions([...VIEW])
  async getPerson(
    @Param("userId", ParseIntPipe) userId: number,
    @Res() res: Response,
  ) {
    try {
      const data = await this.service.getUserHierarchy(userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "User hierarchy retrieved",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to load hierarchy",
        data: null,
      });
    }
  }

  @Put("people/:userId")
  @RequiredPermissions([...UPDATE, ...CREATE])
  async setManagers(
    @Param("userId", ParseIntPipe) userId: number,
    @Body() body: SetUserManagersDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const actorId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.service.setUserManagers(userId, body, actorId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message:
          "Reporting managers updated (module store only; legacy user.manager_id unchanged)",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to set managers",
        data: null,
      });
    }
  }

  @Get("edges")
  @RequiredPermissions([...VIEW])
  async listEdges(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("user_id") user_id?: string,
    @Query("manager_id") manager_id?: string,
    @Query("department") department?: string,
    @Query("relationship") relationship?: string,
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.service.listEdges({
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
        search,
        user_id: user_id ? parseInt(user_id, 10) : undefined,
        manager_id: manager_id ? parseInt(manager_id, 10) : undefined,
        department,
        relationship,
        activeOnly: activeOnly !== "false" && activeOnly !== "0",
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reporting edges retrieved",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to list edges",
        data: null,
      });
    }
  }

  @Get("edges/:id")
  @RequiredPermissions([...VIEW])
  async getEdge(@Param("id", ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const data = await this.service.findEdge(id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reporting edge retrieved",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to get edge",
        data: null,
      });
    }
  }

  @Post("edges")
  @RequiredPermissions([...CREATE])
  async createEdge(
    @Body() body: CreateReportingEdgeDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const actorId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.service.createEdge(body, actorId);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Reporting edge created",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to create edge",
        data: null,
      });
    }
  }

  @Patch("edges/:id")
  @RequiredPermissions([...UPDATE])
  async updateEdge(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateReportingEdgeDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const actorId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.service.updateEdge(id, body, actorId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reporting edge updated",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update edge",
        data: null,
      });
    }
  }

  @Delete("edges/:id")
  @RequiredPermissions([...DELETE])
  async deleteEdge(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const actorId = req?.user?.id > 0 ? req.user.id : null;
      await this.service.archiveEdge(id, actorId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Reporting edge archived",
        data: null,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to archive edge",
        data: null,
      });
    }
  }
}
