import { BadRequestException, Injectable } from "@nestjs/common";
import { DonationReceiptsService } from "src/email/donationReceipts.service";
import { getReceiptLogoUrl } from "src/email/receipt-logo.util";
import {
  DONATION_RECEIPT_FORMAT,
  HORIZONTAL_RECEIPT_FORMAT,
  ReceiptFormatKey,
  VERTICAL_RECEIPT_FORMAT,
} from "src/email/receipt-formats";

@Injectable()
export class DonationsReceiptsService {
  constructor(
    private readonly donationReceiptsService: DonationReceiptsService,
  ) {}

  resolveDefaultStyle(donation: any): ReceiptFormatKey {
    const method = String(donation?.donation_method || "").toLowerCase();
    const hasInKind =
      method === "in_kind" ||
      (Array.isArray(donation?.in_kind_items) &&
        donation.in_kind_items.length > 0);
    return hasInKind ? "donation" : "horizontal";
  }

  normalizeStyle(
    donation: any,
    style?: string | null,
  ): ReceiptFormatKey {
    const normalized = String(style || "").trim().toLowerCase();
    if (
      normalized === "horizontal" ||
      normalized === "vertical" ||
      normalized === "donation"
    ) {
      return normalized;
    }
    return this.resolveDefaultStyle(donation);
  }

  private donorDisplayName(donor: any): string {
    return (
      donor?.name ||
      donor?.company_name ||
      donor?.first_name ||
      "Valued Donor"
    );
  }

  private instrumentNo(donation: any): string {
    return (
      donation?.transaction_id ||
      donation?.cheque_number ||
      donation?.orderId ||
      "-"
    );
  }

  private displayAmount(donation: any): string {
    const raw = donation?.paid_amount ?? donation?.amount;
    if (raw == null || raw === "") return "-";
    const num = Number(raw);
    if (!Number.isFinite(num)) return String(raw);
    return num.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatReceiptDate(donation: any): string {
    if (!donation?.date) return "-";
    const d = new Date(donation.date);
    if (Number.isNaN(d.getTime())) return String(donation.date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  private paymentTypeLabel(donation: any): string {
    const method = String(donation?.donation_method || "").trim();
    if (!method) return "-";
    return method
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  buildReceiptHtml(donation: any, style: ReceiptFormatKey): string {
    const donor = donation?.donor || {};
    const logoUrl = getReceiptLogoUrl();
    const donorName = this.donorDisplayName(donor);
    const receiptNo = String(donation?.ref || donation?.id || "-");
    const receiptDate = this.formatReceiptDate(donation);
    const amount = this.displayAmount(donation);
    const currency = donation?.currency || "PKR";
    const instrument = this.instrumentNo(donation);

    if (style === "donation") {
      const products =
        donation?.in_kind_items?.map((item: any) => ({
          name: item.item_name,
          qty: item.quantity,
          amount: item.estimated_value ?? 0,
        })) || [];

      return DONATION_RECEIPT_FORMAT({
        logoUrl,
        receiptNo,
        receiptDate,
        location: donation.city || donor.city || "-",
        store: "-",
        project: donation.project_name || "-",
        activity: donation.donation_type || "-",
        libraryAccount: "-",
        donationType: donation.donation_type || donor.donor_type || "-",
        donorName,
        contactNo: donor.phone || "-",
        address: donor.address || donation.address || "-",
        cnic: donor.cnic || "-",
        donorBank: donation.bank_name || "-",
        bankAccount:
          donation.bank || donation.cheque_number || donation.transaction_id || "-",
        unrestrictedAccount: donation.donation_type || "-",
        narration: donation.note || donation.on_behalf_names || "-",
        products,
      });
    }

    if (style === "vertical") {
      const amountLabel =
        amount === "-"
          ? "-"
          : `${currency} ${Number(amount).toLocaleString("en-PK", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;

      return VERTICAL_RECEIPT_FORMAT({
        logoUrl,
        receiptNo,
        donorName,
        email: donor.email || "-",
        phone: donor.phone || "-",
        address: donor.address || donation.address || "-",
        donorType: donor.donor_type || donation.donation_type || "-",
        projectName: donation.project_name || "-",
        donation: donation.donation_type || "-",
        method: this.paymentTypeLabel(donation),
        bank: donation.bank || donation.bank_name || "-",
        instrumentNo: instrument,
        description:
          donation.tran_description ||
          donation.note ||
          this.paymentTypeLabel(donation),
        amount: amountLabel,
        amountInWords: "-",
        receivedBy:
          donation?.created_by?.name ||
          donation?.created_by?.email ||
          "-",
      });
    }

    return HORIZONTAL_RECEIPT_FORMAT({
      logoUrl,
      receiptNo,
      receiptDate,
      project: donation.project_name || "-",
      donationType: donation.donation_type || "-",
      donorName,
      address: donor.address || donation.address || "-",
      contactNo: donor.phone || "-",
      email: donor.email || "-",
      description:
        donation.tran_description ||
        donation.note ||
        this.paymentTypeLabel(donation),
      amount,
      currency,
      paymentType: this.paymentTypeLabel(donation),
      instrumentNo: instrument,
    });
  }

  async sendDonationReceipt(
    donation: any,
    style?: string | null,
  ): Promise<boolean> {
    const donor = donation?.donor;
    if (!donor?.email) {
      throw new BadRequestException("Donor email not found for this donation");
    }

    const receiptStyle = this.normalizeStyle(donation, style);
    const html = this.buildReceiptHtml(donation, receiptStyle);
    const receiptNo = donation.ref || donation.id;

    return this.donationReceiptsService.sendRenderedReceiptEmail({
      donorEmail: donor.email,
      donationId: donation.id,
      receiptNo,
      html,
      style: receiptStyle,
    });
  }
}
