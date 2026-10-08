import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpStatus,
  Res,
  Req,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { CurrentUser } from "src/auth/current-user.decorator";
import { S3StorageService } from "src/utils/storage/s3-storage.service";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { RecurringDonationsLedgerService } from "./recurring-donations-ledger.service";
import {
  RECURRING_DONATION_LIST_VIEW_GUARD,
  RECURRING_DONATION_VIEW_GUARD,
  RECURRING_DONATION_CREATE_GUARD,
  RECURRING_DONATION_UPDATE_GUARD,
  RECURRING_DONATION_DELETE_GUARD,
} from "../../permissions/recurring-donations-permissions.constants";
import { CreateRecurringDonationDto } from "./dto/create-recurring-donation.dto";
import { UpdateRecurringDonationDto } from "./dto/update-recurring-donation.dto";
import { DonorService } from "src/dms/donor/donor.service";

const recurringDonationFileUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller("recurring-donations")
@UseGuards(JwtGuard, PermissionsGuard)
export class RecurringDonationsController {
  constructor(
    private readonly ledgerService: RecurringDonationsLedgerService,
    private readonly donorService: DonorService,
    private readonly s3Storage: S3StorageService,
  ) {}

  @Post("search")
  @RequiredPermissions([...RECURRING_DONATION_LIST_VIEW_GUARD])
  async search(
    @Body() payload: Record<string, any>,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.ledgerService.search(payload, req?.user);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Recurring donations fetched successfully",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to fetch recurring donations",
        data: [],
        pagination: null,
      });
    }
  }

  @Post()
  @RequiredPermissions([...RECURRING_DONATION_CREATE_GUARD])
  async create(
    @Body() body: CreateRecurringDonationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const user = req?.user ?? null;
      if (body?.donor_id) {
        await this.donorService.assertStaffCanLinkDonor(
          user,
          Number(body.donor_id),
        );
      }
      const userId = user?.id > 0 ? user.id : null;
      const data = await this.ledgerService.createStaffSubscription(
        body,
        userId,
      );
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: "Recurring donation created successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 403
          ? HttpStatus.FORBIDDEN
          : error?.status === 404
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to create recurring donation",
        data: null,
      });
    }
  }

  @Get("lookup")
  @RequiredPermissions([...RECURRING_DONATION_LIST_VIEW_GUARD])
  async lookup(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.ledgerService.listForLookup({
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
  @RequiredPermissions([...RECURRING_DONATION_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.ledgerService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Recurring donation fetched successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to fetch recurring donation",
        data: null,
      });
    }
  }

  @Patch(":id")
  @RequiredPermissions([...RECURRING_DONATION_UPDATE_GUARD])
  async update(
    @Param("id") id: string,
    @Body() body: UpdateRecurringDonationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const user = req?.user ?? null;
      if (body?.donor_id != null) {
        await this.donorService.assertStaffCanLinkDonor(user, Number(body.donor_id));
      }
      const userId = user?.id > 0 ? user.id : null;
      const data = await this.ledgerService.updateStaffSubscription(
        +id,
        body,
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Recurring donation updated successfully",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 403
          ? HttpStatus.FORBIDDEN
          : error?.status === 404
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update recurring donation",
        data: null,
      });
    }
  }

  /** Same installment payment link the cron sends (email + WhatsApp). */
  @Post(":id/send-installment-link")
  @RequiredPermissions([...RECURRING_DONATION_VIEW_GUARD])
  async sendInstallmentLink(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.ledgerService.sendInstallmentPaymentLink(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Installment payment link sent",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to send installment payment link",
        data: null,
      });
    }
  }

  /** Admin: mark selected pending period dues as paid (no donor/donation deletes). */
  @Post(":id/mark-installments-paid")
  @RequiredPermissions([...RECURRING_DONATION_VIEW_GUARD])
  async markInstallmentsPaid(
    @Param("id") id: string,
    @Body() body: { installment_ids?: number[]; note?: string },
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.ledgerService.markInstallmentsPaid(
        +id,
        {
          installmentIds: body?.installment_ids || [],
          note: body?.note,
        },
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: `Marked ${data.marked} installment(s) as paid`,
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 403
          ? HttpStatus.FORBIDDEN
          : error?.status === 404
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to mark installments as paid",
        data: null,
      });
    }
  }

  /** Soft-archive subscription + its installments (does not delete donors/donations). */
  @Delete(":id")
  @RequiredPermissions([...RECURRING_DONATION_DELETE_GUARD])
  async remove(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.ledgerService.archiveStaffSubscription(
        +id,
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Recurring donation archived (record kept)",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to archive recurring donation",
        data: null,
      });
    }
  }

  /** Staff: edit one installment (status / amount / period). Non-Stripe only. */
  @Patch(":id/installments/:installmentId")
  @RequiredPermissions([...RECURRING_DONATION_UPDATE_GUARD])
  async updateInstallment(
    @Param("id") id: string,
    @Param("installmentId") installmentId: string,
    @Body()
    body: {
      status?: string;
      amount?: number;
      period_key?: string | null;
      note?: string | null;
    },
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.ledgerService.updateStaffInstallment(
        +id,
        +installmentId,
        body || {},
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Installment updated",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 403
          ? HttpStatus.FORBIDDEN
          : error?.status === 404
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to update installment",
        data: null,
      });
    }
  }

  @Post(":id/attachments/upload")
  @RequiredPermissions([...RECURRING_DONATION_UPDATE_GUARD])
  @UseInterceptors(FileInterceptor("file", recurringDonationFileUploadOptions))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("description") description: string,
    @Body("name") name: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    try {
      if (!file) {
        throw new BadRequestException("File is required");
      }
      const uploaded = await this.s3Storage.uploadDonationAttachment(file);
      const attachmentName =
        String(description || name || "").trim() || undefined;
      const result = await this.ledgerService.addAttachment(
        +id,
        {
          file_name: file.originalname,
          file_url: uploaded.url,
          file_type: file.mimetype,
          description: attachmentName,
        },
        user,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Attachment uploaded successfully",
        data: result,
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

  @Delete(":id/attachments/:attachmentId")
  @RequiredPermissions([...RECURRING_DONATION_UPDATE_GUARD])
  async removeAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.ledgerService.removeAttachment(
        +id,
        +attachmentId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Attachment removed",
        data: result,
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

  /** Soft-archive one installment row. */
  @Delete(":id/installments/:installmentId")
  @RequiredPermissions([...RECURRING_DONATION_DELETE_GUARD])
  async removeInstallment(
    @Param("id") id: string,
    @Param("installmentId") installmentId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req?.user?.id > 0 ? req.user.id : null;
      const data = await this.ledgerService.archiveStaffInstallment(
        +id,
        +installmentId,
        userId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Installment deleted",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to delete installment",
        data: null,
      });
    }
  }
}
