import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
  Request,
} from "@nestjs/common";
import { Response } from "express";
import { CeoComplaintsService } from "./ceo-complaints.service";
import { CreateCeoComplaintDto } from "./dto/create-ceo-complaint.dto";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "src/permissions/guards/permissions.guard";
import { RequiredPermissions } from "src/permissions";

const dtoPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
});

@Controller("ceo-complaints")
@UseGuards(JwtGuard, PermissionsGuard)
export class CeoComplaintsController {
  constructor(private readonly service: CeoComplaintsService) {}

  @Post()
  @RequiredPermissions(["ceo_office.ceo_complaints.create", "super_admin"])
  @UsePipes(dtoPipe)
  async create(
    @Body() dto: CreateCeoComplaintDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.service.createStaff(dto, req?.user);
      return res.status(HttpStatus.CREATED).json(result);
    } catch (error: any) {
      const status =
        error?.status || error?.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to create complaint",
        data: null,
      });
    }
  }

  @Post("search")
  @RequiredPermissions([
    "ceo_office.ceo_complaints.list_view",
    "ceo_office.ceo_complaints.view",
    "super_admin",
  ])
  async search(@Body() payload: Record<string, any>, @Res() res: Response) {
    try {
      const result = await this.service.search(payload);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Complaints fetched successfully",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to fetch complaints",
        data: [],
        pagination: null,
      });
    }
  }

  @Get(":id")
  @RequiredPermissions(["ceo_office.ceo_complaints.view", "super_admin"])
  async findOne(
    @Param("id", ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    try {
      const result = await this.service.findOne(id);
      return res.status(HttpStatus.OK).json(result);
    } catch (error: any) {
      const status =
        error?.status || error?.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Complaint not found",
        data: null,
      });
    }
  }
}
