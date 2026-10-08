import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApplicationsService } from "./applications.service";
import { CreateApplicationDto } from "./dto/create-application.dto";
import { UpdateApplicationDto } from "./dto/update-application.dto";
import { ConditionalJwtGuard } from "../../../../auth/guards/conditional-jwt.guard";
import { PermissionsGuard } from "../../../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../../../permissions";

const resumeUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
};

const dtoPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
});

@Controller("job_applications")
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  /** Public job application submit (website careers Apply tab). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(dtoPipe)
  @UseInterceptors(FileInterceptor("cvResume", resumeUploadOptions))
  async create(
    @Body() createApplicationDto: CreateApplicationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      const application = await this.applicationsService.create(
        createApplicationDto,
        file,
      );
      return {
        success: true,
        message: "Application submitted successfully",
        data: application,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error?.message || "Failed to submit application",
      );
    }
  }

  @Get()
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["hr.applications.list_view", "super_admin"])
  findAll(
    @Query("page") page: string = "1",
    @Query("pageSize") pageSize: string = "10",
    @Query("sortField") sortField: string = "created_at",
    @Query("sortOrder") sortOrder: "ASC" | "DESC" = "DESC",
    @Query("job_id") job_id?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("gender") gender?: string,
    @Query("city") city?: string,
    @Query("country") country?: string,
    @Query("cnic") cnic?: string,
    @Query("has_work_experience") has_work_experience?: string,
    @Query("from_date") from_date?: string,
    @Query("to_date") to_date?: string,
  ) {
    return this.applicationsService.findAll({
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 10,
      sortField,
      sortOrder,
      job_id: job_id ? parseInt(job_id, 10) : undefined,
      status,
      search,
      gender,
      city,
      country,
      cnic,
      has_work_experience:
        has_work_experience === "true" || has_work_experience === "1"
          ? true
          : has_work_experience === "false" || has_work_experience === "0"
            ? false
            : undefined,
      from_date,
      to_date,
    });
  }

  @Get(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["hr.applications.view", "super_admin"])
  findOne(@Param("id") id: string) {
    return this.applicationsService.findOne(+id);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["hr.applications.update", "super_admin"])
  @UsePipes(dtoPipe)
  async update(
    @Param("id") id: string,
    @Body() updateApplicationDto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(+id, updateApplicationDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["hr.applications.delete", "super_admin"])
  async remove(@Param("id") id: string) {
    return this.applicationsService.remove(+id);
  }
}
