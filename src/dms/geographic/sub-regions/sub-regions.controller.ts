import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpStatus,
  Res,
  Query,
} from "@nestjs/common";
import { Response } from "express";
import { SubRegionsService } from "./sub-regions.service";
import { CreateSubRegionDto } from "./dto/create-sub-region.dto";
import { UpdateSubRegionDto } from "./dto/update-sub-region.dto";
import { JwtGuard } from "../../../auth/jwt.guard";
import { PermissionsGuard } from "../../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../../permissions/decorators/require-permission.decorator";

@Controller("sub-regions")
@UseGuards(JwtGuard, PermissionsGuard)
export class SubRegionsController {
  constructor(private readonly subRegionsService: SubRegionsService) {}

  @Post()
  @RequiredPermissions([
    "geographic.sub_regions.create",
    "super_admin",
    "geographic_manager",
  ])
  async create(
    @Body() createSubRegionDto: CreateSubRegionDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.subRegionsService.create(createSubRegionDto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Sub region created successfully",
        data: result,
      });
    } catch (error) {
      const status = error.message.includes("already exists")
        ? HttpStatus.CONFLICT
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Get()
  async findAll(
    @Query("region_id") regionId?: string,
    @Query("country_id") countryId?: string,
    @Res() res?: Response,
  ) {
    try {
      let result;
      if (regionId) {
        result = await this.subRegionsService.findByRegion(+regionId);
      } else if (countryId) {
        result = await this.subRegionsService.findByCountry(+countryId);
      } else {
        result = await this.subRegionsService.findAll();
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Sub regions retrieved successfully",
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([
    "geographic.sub_regions.view",
    "super_admin",
    "geographic_manager",
    "geographic_user",
  ])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const result = await this.subRegionsService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Sub region retrieved successfully",
        data: result,
      });
    } catch (error) {
      const status = error.message.includes("not found")
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
  @RequiredPermissions([
    "geographic.sub_regions.update",
    "super_admin",
    "geographic_manager",
  ])
  async update(
    @Param("id") id: string,
    @Body() updateSubRegionDto: UpdateSubRegionDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.subRegionsService.update(+id, updateSubRegionDto);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Sub region updated successfully",
        data: result,
      });
    } catch (error) {
      const status = error.message.includes("not found")
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
  @RequiredPermissions([
    "geographic.sub_regions.delete",
    "super_admin",
    "geographic_manager",
  ])
  async remove(@Param("id") id: string, @Res() res: Response) {
    try {
      const result = await this.subRegionsService.remove(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
        data: null,
      });
    } catch (error) {
      const status = error.message.includes("not found")
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
