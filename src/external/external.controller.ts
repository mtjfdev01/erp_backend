import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { DonationsService } from "../donations/donations.service";
import { CreateDonationDto } from "../donations/dto/create-donation.dto";
import { ExternalApiKeyGuard } from "./guards/external-api-key.guard";

/**
 * Single partner endpoint: same payload as website/staff donation create.
 * Donor auto-register + donation + recurring ledger all happen inside DonationsService.create.
 *
 * create_invoice defaults to false (record data only; no PayFast/Meezan/Stripe invoice).
 * Pass create_invoice: true to use the existing gateway invoice path.
 */
@Controller("external/v1")
@UseGuards(ExternalApiKeyGuard)
export class ExternalController {
  constructor(private readonly donationsService: DonationsService) {}

  private systemUser(req: any) {
    return req?.user ?? { id: -1, role: "external_api" };
  }

  private errorStatus(error: any): number {
    if (error?.status === 403 || error?.statusCode === 403) {
      return HttpStatus.FORBIDDEN;
    }
    if (error?.status === 404 || error?.statusCode === 404) {
      return HttpStatus.NOT_FOUND;
    }
    if (
      error?.status === 409 ||
      error?.statusCode === 409 ||
      String(error?.message || "")
        .toLowerCase()
        .includes("already exists")
    ) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.BAD_REQUEST;
  }

  /**
   * POST /external/v1
   * Body = same CreateDonationDto shape used by /donations (website payload).
   */
  @Post()
  async handle(
    @Body() body: CreateDonationDto & { create_invoice?: boolean; source?: string },
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const createInvoice = body.create_invoice === true;
      const partnerSource =
        req?.user?.donation_source ||
        req?.externalPartner?.donation_source ||
        null;
      const dto: CreateDonationDto = {
        ...body,
        donation_source:
          body.donation_source ||
          (body as any).source ||
          partnerSource ||
          "external",
        create_invoice: createInvoice,
      };

      if (!dto.amount && dto.donation_method !== "in_kind") {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: "amount is required",
          data: null,
        });
      }

      const { data, donationId, deferPostCreate } =
        await this.donationsService.create(dto, this.systemUser(req));

      res.status(HttpStatus.CREATED).json({
        success: true,
        message: createInvoice
          ? "Donation created successfully"
          : "Donation recorded successfully (no invoice)",
        data,
        donation_id: donationId,
        create_invoice: createInvoice,
      });

      if (deferPostCreate) {
        void this.donationsService
          .finalizeDonationPostCreate(donationId, dto, this.systemUser(req))
          .catch(() => undefined);
      }

      return;
    } catch (error: any) {
      return res.status(this.errorStatus(error)).json({
        success: false,
        message: error?.message || "Request failed",
        data: null,
      });
    }
  }
}
