import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { Response } from "express";
import { OperationalQueriesService } from "./operational-queries.service";
import { CreateOperationalQueryDto } from "./dto/create-operational-query.dto";
import { ReviewOperationalQueryDto } from "./dto/review-operational-query.dto";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";

const OQ_VIEW_GUARD = [
  "fund_raising.operational_queries.view",
  "fund_raising.donation_box.view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
];

const OQ_CREATE_GUARD = [
  "fund_raising.operational_queries.create",
  "fund_raising.donation_box.update",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
];

const OQ_REVIEW_GUARD = [
  "fund_raising.operational_queries.update",
  "fund_raising.donation_box.update",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
];

@Controller("operational-queries")
@UseGuards(JwtGuard, PermissionsGuard)
export class OperationalQueriesController {
  constructor(private readonly service: OperationalQueriesService) {}

  @Post()
  @RequiredPermissions([...OQ_CREATE_GUARD])
  async create(
    @Body() dto: CreateOperationalQueryDto,
    @Res() res: Response,
    @CurrentUser() currentUser?: any,
  ) {
    try {
      const data = await this.service.create(dto, currentUser);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Operational query submitted for approval",
        data,
      });
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        return res.status(HttpStatus.FORBIDDEN).json({
          success: false,
          message: error.message,
          data: null,
        });
      }
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
  @RequiredPermissions([...OQ_VIEW_GUARD])
  async list(
    @Query() query: Record<string, string>,
    @Res() res: Response,
    @CurrentUser() currentUser?: any,
  ) {
    try {
      const result = await this.service.findAll(
        {
          status: query.status,
          subject_type: query.subject_type,
          subject_id: query.subject_id ? Number(query.subject_id) : undefined,
          action: query.action,
          scope: (query.scope as any) || "all",
          page: query.page ? Number(query.page) : undefined,
          pageSize: query.pageSize ? Number(query.pageSize) : undefined,
          search: query.search,
        },
        currentUser,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
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
  @RequiredPermissions([...OQ_VIEW_GUARD])
  async findOne(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    try {
      const data = await this.service.findOne(+id);
      return res.status(HttpStatus.OK).json({ success: true, data });
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

  @Post(":id/approve")
  @RequiredPermissions([...OQ_REVIEW_GUARD])
  async approve(
    @Param("id") id: string,
    @Body() body: ReviewOperationalQueryDto,
    @Res() res: Response,
    @CurrentUser() currentUser?: any,
  ) {
    try {
      const data = await this.service.approve(+id, body?.review_note, currentUser);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Operational query approved and applied",
        data,
      });
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        return res.status(HttpStatus.FORBIDDEN).json({
          success: false,
          message: error.message,
          data: null,
        });
      }
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

  @Post(":id/reject")
  @RequiredPermissions([...OQ_REVIEW_GUARD])
  async reject(
    @Param("id") id: string,
    @Body() body: ReviewOperationalQueryDto,
    @Res() res: Response,
    @CurrentUser() currentUser?: any,
  ) {
    try {
      const data = await this.service.reject(+id, body?.review_note, currentUser);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Operational query rejected",
        data,
      });
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        return res.status(HttpStatus.FORBIDDEN).json({
          success: false,
          message: error.message,
          data: null,
        });
      }
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

  @Post(":id/cancel")
  @RequiredPermissions([...OQ_CREATE_GUARD])
  async cancel(
    @Param("id") id: string,
    @Res() res: Response,
    @CurrentUser() currentUser?: any,
  ) {
    try {
      const data = await this.service.cancel(+id, currentUser);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Operational query cancelled",
        data,
      });
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        return res.status(HttpStatus.FORBIDDEN).json({
          success: false,
          message: error.message,
          data: null,
        });
      }
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
