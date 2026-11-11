import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Logger,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { memoryStorage } from "multer";
import { ReceiptIntakeApiKeyGuard } from "./receipt-intake-api-key.guard";
import {
  ReceiptIntakeBody,
  ReceiptIntakeService,
} from "./receipt-intake.service";

const receiptUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

/**
 * Additive public intake — API-key auth only.
 * POST /donations/public/receipt-intake
 * multipart: phone, receipt; optional recurring + field overrides.
 */
@Controller("donations/public")
@UseGuards(ReceiptIntakeApiKeyGuard)
export class ReceiptIntakeController {
  private readonly logger = new Logger(ReceiptIntakeController.name);

  constructor(private readonly receiptIntakeService: ReceiptIntakeService) {}

  @Post("receipt-intake")
  @UseInterceptors(FileInterceptor("receipt", receiptUploadOptions))
  async intake(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ReceiptIntakeBody,
    @Res() res: Response,
  ) {
    try {
      if (!file?.buffer?.length) {
        throw new BadRequestException("receipt file is required");
      }
      if (!String(body?.phone || "").trim()) {
        throw new BadRequestException("phone is required");
      }

      const data = await this.receiptIntakeService.intake(file, body || {});
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Receipt intake completed",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status || error?.statusCode || HttpStatus.BAD_REQUEST;
      const responseBody = error?.getResponse?.() ?? error?.response;
      const message =
        typeof responseBody === "string"
          ? responseBody
          : responseBody?.message ||
            error?.message ||
            "Receipt intake failed";
      this.logger.warn(`receipt-intake failed: ${message}`);
      return res.status(status).json({
        success: false,
        message: Array.isArray(message) ? message.join(", ") : message,
        data: null,
      });
    }
  }
}
