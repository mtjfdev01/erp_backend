import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { DonorService } from "src/dms/donor/donor.service";
import { S3StorageService } from "src/utils/storage/s3-storage.service";
import { DonationsService } from "../donations.service";
import { RecurringDonationsLedgerService } from "../recurring_donations/recurring-donations-ledger.service";
import {
  ReceiptAiExtractionService,
  ReceiptExtractedFields,
} from "./receipt-ai-extraction.service";
import {
  RECEIPT_INTAKE_DEFAULT_METHOD,
  RECEIPT_INTAKE_DONATION_SOURCE,
} from "./receipt-intake.constants";

export type ReceiptIntakeBody = {
  phone?: string;
  recurring?: string | boolean;
  amount?: string | number;
  currency?: string;
  donation_date?: string;
  donor_name?: string;
  donation_method?: string;
  transaction_id?: string;
  bank_name?: string;
  notes?: string;
};

const PUBLIC_INTAKE_USER = {
  id: -1,
  role: "public_donor",
  name: "Receipt Intake",
};

@Injectable()
export class ReceiptIntakeService {
  private readonly logger = new Logger(ReceiptIntakeService.name);

  constructor(
    private readonly receiptAi: ReceiptAiExtractionService,
    private readonly donorService: DonorService,
    private readonly donationsService: DonationsService,
    private readonly s3Storage: S3StorageService,
    private readonly recurringLedger: RecurringDonationsLedgerService,
  ) {}

  private parseBool(value: unknown): boolean {
    if (value === true || value === 1) return true;
    const s = String(value ?? "")
      .trim()
      .toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  }

  private pickOverride(
    bodyVal: unknown,
    extracted: string | number | null | undefined,
  ): string | number | null {
    if (bodyVal !== undefined && bodyVal !== null && String(bodyVal).trim() !== "") {
      return typeof extracted === "number"
        ? Number(bodyVal)
        : String(bodyVal).trim();
    }
    if (extracted === undefined || extracted === null) return null;
    return extracted;
  }

  private normalizePhone(phone: string): string {
    const raw = String(phone || "").trim();
    if (!raw) {
      throw new BadRequestException("phone is required");
    }
    return raw;
  }

  private resolveMethod(
    override: unknown,
    extracted: string | null,
  ): string {
    const raw = String(override ?? extracted ?? "")
      .trim()
      .toLowerCase();
    const map: Record<string, string> = {
      bank_transfer: "bank_transfer",
      bank: "bank_transfer",
      transfer: "bank_transfer",
      cash: "cash",
      cheque: "cheque",
      check: "cheque",
      card: "credit_card",
      credit_card: "credit_card",
      online: "online",
      whatsapp: "whatsapp",
      other: "bank_transfer",
    };
    if (raw && map[raw]) return map[raw];
    if (
      raw &&
      [
        "cash",
        "bank_transfer",
        "credit_card",
        "cheque",
        "online",
        "whatsapp",
      ].includes(raw)
    ) {
      return raw;
    }
    return RECEIPT_INTAKE_DEFAULT_METHOD;
  }

  async intake(
    file: Express.Multer.File,
    body: ReceiptIntakeBody,
  ): Promise<{
    donor: { id: number; name: string | null; phone: string | null };
    donation: {
      id: number;
      amount: number;
      currency: string;
      status: string;
      donation_method: string;
      donation_source: string;
      date: string | Date | null;
    };
    attachment: { id: number; file_url: string } | null;
    recurring: { id: number; status: string } | null;
    extraction: ReceiptExtractedFields;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("receipt file is required");
    }

    const phone = this.normalizePhone(body.phone);
    const wantRecurring = this.parseBool(body.recurring);

    const extraction = await this.receiptAi.extractFields(file);

    const amountRaw = this.pickOverride(body.amount, extraction.amount);
    const amount =
      typeof amountRaw === "number"
        ? amountRaw
        : Number(String(amountRaw ?? "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        "Could not determine a valid donation amount from the receipt; pass amount override",
      );
    }

    const currency =
      String(
        this.pickOverride(body.currency, extraction.currency) || "PKR",
      )
        .trim()
        .toUpperCase() || "PKR";

    const donorName =
      String(
        this.pickOverride(body.donor_name, extraction.donor_name) || "",
      ).trim() || null;

    const donationDate =
      String(
        this.pickOverride(body.donation_date, extraction.donation_date) || "",
      ).trim() || new Date().toISOString().slice(0, 10);

    const donationMethod = this.resolveMethod(
      body.donation_method,
      extraction.donation_method,
    );

    const transactionId =
      String(
        this.pickOverride(body.transaction_id, extraction.transaction_id) ||
          "",
      ).trim() || undefined;

    const bankName =
      String(
        this.pickOverride(body.bank_name, extraction.bank_name) || "",
      ).trim() || undefined;

    const noteParts = [
      String(this.pickOverride(body.notes, extraction.notes) || "").trim(),
      "Created via receipt intake OCR",
    ].filter(Boolean);

    const donor = await this.donorService.autoRegisterFromDonation({
      donor_name: donorName || undefined,
      donor_phone: phone,
      recurring: wantRecurring,
      recurring_consent: wantRecurring,
    });

    if (!donor?.id) {
      throw new BadRequestException(
        "Unable to create or resolve donor from phone",
      );
    }

    const createResult = await this.donationsService.create(
      {
        donor_phone: phone,
        donor_name: donorName || undefined,
        amount,
        currency,
        date: donationDate as any,
        donation_method: donationMethod,
        donation_source: RECEIPT_INTAKE_DONATION_SOURCE,
        status: "completed",
        create_invoice: false,
        transaction_id: transactionId,
        bank_name: bankName,
        note: noteParts.join(". "),
        // Do not set recurring here — ledger enrollment is explicit below
        recurring: false,
      } as any,
      PUBLIC_INTAKE_USER as any,
    );

    const donationId = Number(
      createResult?.donationId ??
        createResult?.data?.id ??
        createResult?.data?.donationId,
    );
    if (!Number.isFinite(donationId) || donationId <= 0) {
      this.logger.error(
        `Receipt intake create returned unexpected shape: ${JSON.stringify(createResult)?.slice(0, 500)}`,
      );
      throw new BadRequestException("Donation create did not return an id");
    }

    let attachment: { id: number; file_url: string } | null = null;
    try {
      const uploaded = await this.s3Storage.uploadDonationAttachment(file);
      const saved = await this.donationsService.addAttachment(
        donationId,
        {
          file_name: file.originalname || "receipt",
          file_url: uploaded.url,
          file_type: file.mimetype || "application/octet-stream",
          description: "Receipt intake scan",
        },
        null,
      );
      attachment = { id: saved.id, file_url: saved.file_url };
    } catch (err: any) {
      this.logger.warn(
        `Receipt S3/attachment failed for donation ${donationId}: ${err?.message || err}`,
      );
    }

    let recurring: { id: number; status: string } | null = null;
    if (wantRecurring) {
      const sub = await this.recurringLedger.createStaffSubscription(
        {
          donor_id: donor.id,
          amount,
          currency,
          billing_interval: "month",
          billing_interval_count: 1,
          consent: true,
          donation_method: donationMethod,
          initial_donation_id: donationId,
          status: "active",
        },
        null,
      );
      recurring = { id: sub.id, status: String(sub.status || "active") };
    }

    return {
      donor: {
        id: donor.id,
        name: (donor as any).name ?? donorName,
        phone: (donor as any).phone ?? phone,
      },
      donation: {
        id: donationId,
        amount,
        currency,
        status: "completed",
        donation_method: donationMethod,
        donation_source: RECEIPT_INTAKE_DONATION_SOURCE,
        date: donationDate,
      },
      attachment,
      recurring,
      extraction,
    };
  }
}
