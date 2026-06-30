import { Injectable, Logger } from "@nestjs/common";
import { EmailService } from "./email.service";
import {
  DONATION_RECEIPT_FORMAT,
  DonationInKindReceiptParams,
  HORIZONTAL_RECEIPT_FORMAT,
  HorizontalReceiptParams,
  ReceiptFormatKey,
  VERTICAL_RECEIPT_FORMAT,
  VerticalReceiptParams,
  renderReceiptFormat,
} from "./receipt-formats";

@Injectable()
export class DonationReceiptsService {
  private readonly logger = new Logger(DonationReceiptsService.name);

  constructor(private readonly emailService: EmailService) {}

  renderReceiptHtml(
    style: ReceiptFormatKey,
    params:
      | HorizontalReceiptParams
      | VerticalReceiptParams
      | DonationInKindReceiptParams,
  ): string {
    switch (style) {
      case "horizontal":
        return renderReceiptFormat("horizontal", params as HorizontalReceiptParams);
      case "vertical":
        return renderReceiptFormat("vertical", params as VerticalReceiptParams);
      case "donation":
        return renderReceiptFormat("donation", params as DonationInKindReceiptParams);
      default:
        return renderReceiptFormat("horizontal", params as HorizontalReceiptParams);
    }
  }

  /**
   * Send an in-kind donation receipt email (donation.html style).
   */
  async sendDonationInKindReceipt(params: {
    donorEmail: string;
    donorName?: string;
    donationId: number;
    amount?: number;
    currency?: string;
    logoUrl?: string;
    data?: Record<string, unknown>;
    products?: Array<{
      name?: string;
      qty?: number;
      amount?: number;
    }>;
  }): Promise<boolean> {
    const {
      donorEmail,
      donorName,
      donationId,
      amount,
      currency,
      logoUrl,
      data = {},
      products,
    } = params;

    if (!donorEmail) return false;

    const subject = `Donation In-Kind Receipt - Donation #${donationId}`;
    const amountLine =
      amount != null
        ? `Amount: ${amount} ${currency || "PKR"}`
        : "Amount: (not specified)";

    const html = DONATION_RECEIPT_FORMAT({
      logoUrl: logoUrl || "",
      receiptNo: String(data.receiptNo ?? donationId),
      receiptDate: data.receiptDate as string | undefined,
      location: data.location as string | undefined,
      store: data.store as string | undefined,
      project: data.project as string | undefined,
      activity: data.activity as string | undefined,
      libraryAccount: data.libraryAccount as string | undefined,
      donationType: data.donationType as string | undefined,
      donorName: (data.donorName as string | undefined) ?? donorName,
      contactNo: data.contactNo as string | undefined,
      address: data.address as string | undefined,
      cnic: data.cnic as string | undefined,
      donorBank: data.donorBank as string | undefined,
      bankAccount: data.bankAccount as string | undefined,
      unrestrictedAccount: data.unrestrictedAccount as string | undefined,
      narration: data.narration as string | undefined,
      products: products || [],
    });

    const text = `In-Kind Donation Receipt\nDonation ID: ${donationId}\n${amountLine}`;

    this.logger.log(
      `Sending in-kind receipt for donation #${donationId} to ${donorEmail}`,
    );

    const sent = await this.emailService.sendReportEmail({
      to: donorEmail,
      subject,
      html,
      text,
    });
    this.logger.log(
      `Donation in-kind receipt sendReportEmail result for donation #${donationId}: ${sent}`,
    );
    return sent;
  }

  /**
   * Send a horizontal donation receipt email (horizontal.html style).
   */
  async sendHorizontalDonationReceiptEmail(params: {
    donorEmail: string;
    logoUrl?: string;
    donor?: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      instrumentNo?: string;
    };
    receipt?: {
      receiptNo?: string | number;
      receiptDate?: string;
      project?: string;
      donationType?: string;
      description?: string;
      amount?: string | number;
      currency?: string;
      paymentType?: string;
    };
    donationId?: number | string;
  }): Promise<boolean> {
    const { donorEmail, logoUrl, donor = {}, receipt = {}, donationId } = params;

    if (!donorEmail) return false;

    const receiptNo = receipt.receiptNo ?? donationId ?? "-";

    const html = HORIZONTAL_RECEIPT_FORMAT({
      logoUrl: logoUrl || "",
      receiptNo: String(receiptNo),
      receiptDate: receipt.receiptDate,
      project: receipt.project,
      donationType: receipt.donationType,
      donorName: donor.name,
      address: donor.address,
      contactNo: donor.phone,
      email: donor.email ?? donorEmail,
      description: receipt.description,
      amount: receipt.amount,
      currency: receipt.currency,
      paymentType: receipt.paymentType,
      instrumentNo: donor.instrumentNo,
    });

    const subject = `Donation Receipt - ${receiptNo}`;
    const amountLine =
      receipt.amount != null
        ? `Amount: ${receipt.amount} ${receipt.currency || "PKR"}`
        : "Amount: (not specified)";

    const text = `Donation Receipt\nReceipt #: ${receiptNo}\n${amountLine}`;

    this.logger.log(
      `Sending horizontal donation receipt for receipt #${receiptNo} to ${donorEmail}`,
    );

    const sent = await this.emailService.sendReportEmail({
      to: donorEmail,
      subject,
      html,
      text,
    });

    this.logger.log(
      `Horizontal donation receipt sendReportEmail result for receipt #${receiptNo}: ${sent}`,
    );

    return sent;
  }

  /**
   * Send a vertical donation receipt email (vertical.html style).
   */
  async sendVerticalDonationReceiptEmail(params: {
    donorEmail: string;
    logoUrl?: string;
    qrCodeUrl?: string;
    donor?: {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      donorType?: string;
    };
    receipt?: {
      receiptNo?: string | number;
      projectName?: string;
      donation?: string;
      method?: string;
      bank?: string;
      instrumentNo?: string;
      description?: string;
      amount?: string;
      amountInWords?: string;
      receivedBy?: string;
    };
    donationId?: number | string;
  }): Promise<boolean> {
    const { donorEmail, logoUrl, qrCodeUrl, donor = {}, receipt = {}, donationId } =
      params;

    if (!donorEmail) return false;

    const receiptNo = receipt.receiptNo ?? donationId ?? "-";

    const html = VERTICAL_RECEIPT_FORMAT({
      logoUrl: logoUrl || "",
      qrCodeUrl,
      receiptNo: String(receiptNo),
      donorName: donor.name,
      email: donor.email ?? donorEmail,
      phone: donor.phone,
      address: donor.address,
      donorType: donor.donorType,
      projectName: receipt.projectName,
      donation: receipt.donation,
      method: receipt.method,
      bank: receipt.bank,
      instrumentNo: receipt.instrumentNo,
      description: receipt.description,
      amount: receipt.amount,
      amountInWords: receipt.amountInWords,
      receivedBy: receipt.receivedBy,
    });

    const subject = `Donation Receipt - ${receiptNo}`;
    const text = `Donation Receipt\nReceipt #: ${receiptNo}\nAmount: ${receipt.amount ?? "-"}`;

    this.logger.log(
      `Sending vertical donation receipt for receipt #${receiptNo} to ${donorEmail}`,
    );

    return this.emailService.sendReportEmail({
      to: donorEmail,
      subject,
      html,
      text,
    });
  }

  /** Send pre-rendered receipt HTML to the donor. */
  async sendRenderedReceiptEmail(params: {
    donorEmail: string;
    donationId: number;
    receiptNo?: string | number;
    html: string;
    style?: string;
  }): Promise<boolean> {
    const { donorEmail, donationId, receiptNo, html, style } = params;
    if (!donorEmail) return false;

    const label =
      style === "donation"
        ? "In-Kind Donation Receipt"
        : "Donation Receipt";
    const subject = `${label} - ${receiptNo ?? donationId}`;
    const text = `${label}\nDonation ID: ${donationId}\nReceipt #: ${receiptNo ?? donationId}`;

    this.logger.log(
      `Sending ${style || "receipt"} for donation #${donationId} to ${donorEmail}`,
    );

    const sent = await this.emailService.sendReportEmail({
      to: donorEmail,
      subject,
      html,
      text,
    });

    this.logger.log(
      `Receipt email result for donation #${donationId}: ${sent}`,
    );
    return sent;
  }
}

// Backward-compat alias for the misspelling requested by the user.
export { DonationReceiptsService as DonationReciptsService };
