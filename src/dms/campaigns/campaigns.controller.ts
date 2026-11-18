import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { UpdateCampaignDto } from "./dto/update-campaign.dto";
import { CampaignFiltersDto } from "./dto/campaign-filters.dto";
import { SetCampaignStatusDto } from "./dto/set-status.dto";
import { CampaignReportQueryDto } from "./dto/report-query.dto";
import {
  CreateCampaignDonationItemDto,
  UpdateCampaignDonationItemDto,
} from "./dto/campaign-donation-item.dto";
import {
  CreateCampaignAdSpendDto,
  UpdateCampaignAdSpendDto,
} from "./dto/campaign-ad-spend.dto";
import { ConditionalJwtGuard } from "../../auth/guards/conditional-jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions";
import { S3StorageService } from "../../utils/storage/s3-storage.service";
import { S3_BUCKET_PROFILE } from "../../utils/storage/s3-bucket-profile";

const adSpendAttachmentUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller("campaigns")
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly s3Storage: S3StorageService,
  ) {}

  // —— Admin CRUD ——

  @Post("upload/ad-spend-attachment")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "dms.campaigns.create",
    "dms.campaigns.update",
    "super_admin",
  ])
  @UseInterceptors(
    FileInterceptor("file", adSpendAttachmentUploadOptions),
  )
  async uploadAdSpendAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    try {
      if (!file) throw new BadRequestException("File is required");
      const uploaded = await this.s3Storage.uploadFile(
        S3_BUCKET_PROFILE.DONATIONS,
        file,
        ["campaigns", "ad-spends"],
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Attachment uploaded successfully",
        data: {
          ...uploaded,
          file_name: file.originalname,
          file_type: file.mimetype,
        },
      });
    } catch (error: any) {
      const status =
        error.status || error.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Post()
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.create", "super_admin"])
  async create(
    @Body() dto: CreateCampaignDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id ?? null;
      const result = await this.campaignsService.create(dto, userId);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Campaign created successfully",
        data: result,
      });
    } catch (error) {
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
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.list_view", "super_admin"])
  async findAll(@Query() filters: CampaignFiltersDto, @Res() res: Response) {
    try {
      const result = await this.campaignsService.findAll(filters);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaigns retrieved successfully",
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

  @Get("lookup")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.list_view", "super_admin"])
  async lookup(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.campaignsService.listForLookup({
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

  @Get(":id/report")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.view", "super_admin"])
  async getReport(
    @Param("id") id: string,
    @Query() query: CampaignReportQueryDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.campaignsService.getReport(
        +id,
        query.from,
        query.to,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign report retrieved",
        data: result,
      });
    } catch (error) {
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

  @Get(":id/donation-items")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.view", "super_admin"])
  async listDonationItems(
    @Param("id") id: string,
    @Query("active_only") activeOnly: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.campaignsService.listDonationItems(
        +id,
        activeOnly === "true",
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign donation items retrieved",
        data: result,
      });
    } catch (error) {
      const status = error.message?.includes("not found")
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  @Post(":id/donation-items")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async createDonationItem(
    @Param("id") id: string,
    @Body() dto: CreateCampaignDonationItemDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.campaignsService.createDonationItem(+id, dto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Donation item created",
        data: result,
      });
    } catch (error) {
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

  @Patch(":id/donation-items/:itemId")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async updateDonationItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCampaignDonationItemDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.campaignsService.updateDonationItem(
        +id,
        +itemId,
        dto,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Donation item updated",
        data: result,
      });
    } catch (error) {
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

  @Delete(":id/donation-items/:itemId")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async removeDonationItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Res() res: Response,
  ) {
    try {
      await this.campaignsService.removeDonationItem(+id, +itemId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Donation item removed",
        data: null,
      });
    } catch (error) {
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

  @Get(":id/ad-spends")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.view", "super_admin"])
  async listAdSpends(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.campaignsService.listAdSpends(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign ad spends retrieved",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  @Post(":id/ad-spends")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async createAdSpend(
    @Param("id") id: string,
    @Body() dto: CreateCampaignAdSpendDto,
    @Res() res: Response,
  ) {
    try {
      const data = await this.campaignsService.createAdSpend(+id, dto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Campaign ad spend created",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Patch(":id/ad-spends/:spendId")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async updateAdSpend(
    @Param("id") id: string,
    @Param("spendId") spendId: string,
    @Body() dto: UpdateCampaignAdSpendDto,
    @Res() res: Response,
  ) {
    try {
      const data = await this.campaignsService.updateAdSpend(
        +id,
        +spendId,
        dto,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign ad spend updated",
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Delete(":id/ad-spends/:spendId")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async removeAdSpend(
    @Param("id") id: string,
    @Param("spendId") spendId: string,
    @Res() res: Response,
  ) {
    try {
      await this.campaignsService.removeAdSpend(+id, +spendId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign ad spend removed",
        data: null,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Get(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.view", "super_admin"])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const result = await this.campaignsService.findByIdOrSlug(id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign retrieved successfully",
        data: result,
      });
    } catch (error) {
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

  @Patch(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCampaignDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id ?? null;
      const result = await this.campaignsService.update(+id, dto, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign updated successfully",
        data: result,
      });
    } catch (error) {
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

  @Patch(":id/status")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.update", "super_admin"])
  async setStatus(
    @Param("id") id: string,
    @Body() dto: SetCampaignStatusDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id ?? null;
      const result = await this.campaignsService.setStatus(
        +id,
        dto.status,
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign status updated",
        data: result,
      });
    } catch (error) {
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

  @Delete(":id")
  @UseGuards(ConditionalJwtGuard, PermissionsGuard)
  @RequiredPermissions(["dms.campaigns.delete", "super_admin"])
  async remove(@Param("id") id: string, @Res() res: Response) {
    try {
      await this.campaignsService.remove(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Campaign archived successfully",
        data: null,
      });
    } catch (error) {
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
