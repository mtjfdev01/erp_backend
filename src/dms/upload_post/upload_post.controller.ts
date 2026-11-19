import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  HttpStatus,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { UploadPostService } from "./upload_post.service";
import { CreateUploadPostDto } from "./dto/create-upload-post.dto";
import { UpdateUploadPostDto } from "./dto/update-upload-post.dto";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { S3StorageService } from "../../utils/storage/s3-storage.service";

const imageUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller("upload-posts")
@UseGuards(JwtGuard, PermissionsGuard)
export class UploadPostController {
  constructor(
    private readonly uploadPostService: UploadPostService,
    private readonly s3Storage: S3StorageService,
  ) {}

  @Post("search")
  @RequiredPermissions([
    "fund_raising.upload_posts.list_view",
    "super_admin",
    "fund_raising_manager",
  ])
  async search(@Body() payload: Record<string, any>, @Res() res: Response) {
    try {
      const result = await this.uploadPostService.search(payload);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Upload posts fetched",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to fetch upload posts",
        data: [],
        pagination: null,
      });
    }
  }

  @Get("lookup")
  @RequiredPermissions([
    "fund_raising.upload_posts.list_view",
    "super_admin",
    "fund_raising_manager",
  ])
  async lookup(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.uploadPostService.listForLookup({
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

  @Get("profiles")
  @RequiredPermissions([
    "fund_raising.upload_posts.create",
    "fund_raising.upload_posts.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async profiles(@Res() res: Response) {
    try {
      const profiles = await this.uploadPostService.listProfiles();
      return res.status(HttpStatus.OK).json({
        success: true,
        data: profiles,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to load Upload-Post profiles",
        data: [],
      });
    }
  }

  @Get("facebook/pages")
  @RequiredPermissions([
    "fund_raising.upload_posts.create",
    "fund_raising.upload_posts.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async facebookPages(
    @Query("user") user: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const pages = await this.uploadPostService.listFacebookPages(user);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: pages,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to load Facebook pages",
        data: [],
      });
    }
  }

  @Post("upload/image")
  @RequiredPermissions([
    "fund_raising.upload_posts.create",
    "fund_raising.upload_posts.update",
    "super_admin",
    "fund_raising_manager",
  ])
  @UseInterceptors(FileInterceptor("file", imageUploadOptions))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    try {
      const result = await this.s3Storage.uploadImage(
        "social_media",
        file,
        ["uploads", "upload_post"],
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Image uploaded",
        data: result,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message,
        data: null,
      });
    }
  }

  @Post()
  @RequiredPermissions([
    "fund_raising.upload_posts.create",
    "super_admin",
    "fund_raising_manager",
  ])
  async create(@Body() dto: CreateUploadPostDto, @Res() res: Response) {
    try {
      const data = await this.uploadPostService.create(dto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Upload post created",
        data,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to create upload post",
        data: null,
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([
    "fund_raising.upload_posts.view",
    "super_admin",
    "fund_raising_manager",
  ])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.uploadPostService.findOne(+id);
      return res.status(HttpStatus.OK).json({ success: true, data });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message,
        data: null,
      });
    }
  }

  @Patch(":id")
  @RequiredPermissions([
    "fund_raising.upload_posts.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUploadPostDto,
    @Res() res: Response,
  ) {
    try {
      const data = await this.uploadPostService.update(+id, dto);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Upload post updated",
        data,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message,
        data: null,
      });
    }
  }

  @Post(":id/sync-status")
  @RequiredPermissions([
    "fund_raising.upload_posts.view",
    "fund_raising.upload_posts.list_view",
    "fund_raising.upload_posts.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async syncStatus(@Param("id") id: string, @Res() res: Response) {
    try {
      const result = await this.uploadPostService.syncStatus(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to sync status from Upload-Post",
        data: null,
      });
    }
  }

  @Post(":id/publish")
  @RequiredPermissions([
    "fund_raising.upload_posts.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async publish(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.uploadPostService.publish(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Post sent to Upload-Post",
        data,
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to publish to Upload-Post",
        data: null,
      });
    }
  }

  @Delete(":id")
  @RequiredPermissions([
    "fund_raising.upload_posts.delete",
    "super_admin",
    "fund_raising_manager",
  ])
  async remove(@Param("id") id: string, @Res() res: Response) {
    try {
      await this.uploadPostService.remove(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Upload post archived",
      });
    } catch (error: any) {
      const status = error?.status || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message,
      });
    }
  }
}
