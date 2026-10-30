import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

export type ReceiptExtractedFields = {
  amount: number | null;
  currency: string | null;
  donation_date: string | null;
  donor_name: string | null;
  donation_method: string | null;
  transaction_id: string | null;
  bank_name: string | null;
  notes: string | null;
};

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

@Injectable()
export class ReceiptAiExtractionService {
  private readonly logger = new Logger(ReceiptAiExtractionService.name);
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new BadRequestException("OPENAI_API_KEY is not configured");
    }
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  private getModel(): string {
    return (
      this.configService.get<string>("OPENAI_RECEIPT_MODEL") ||
      this.configService.get<string>("OPENAI_RESUME_MODEL") ||
      "gpt-4o-mini"
    );
  }

  private resolveContentType(file: Express.Multer.File): string {
    const mime = String(file.mimetype || "").toLowerCase().trim();
    if (mime) return mime === "image/jpg" ? "image/jpeg" : mime;
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".pdf")) return "application/pdf";
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".webp")) return "image/webp";
    if (name.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }

  private buildPrompt(): string {
    return [
      "Extract donation/payment receipt fields from this image or PDF.",
      "Return a JSON object with exactly these keys:",
      "amount (number or null),",
      "currency (ISO 4217 string like PKR/USD or null),",
      "donation_date (YYYY-MM-DD or null),",
      "donor_name (string or null),",
      "donation_method (one of: bank_transfer, cash, cheque, card, whatsapp, other — or null),",
      "transaction_id (string or null),",
      "bank_name (string or null),",
      "notes (short string or null).",
      "Use null when a field is not clearly present. Do not invent values.",
      "If multiple amounts appear, prefer the total paid / credit amount.",
    ].join(" ");
  }

  private parseResponse(raw: string | null | undefined): ReceiptExtractedFields {
    const empty: ReceiptExtractedFields = {
      amount: null,
      currency: null,
      donation_date: null,
      donor_name: null,
      donation_method: null,
      transaction_id: null,
      bank_name: null,
      notes: null,
    };
    if (!raw) return empty;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn("Receipt AI returned non-JSON content");
      return empty;
    }

    const amountRaw = parsed.amount;
    let amount: number | null = null;
    if (typeof amountRaw === "number" && Number.isFinite(amountRaw)) {
      amount = amountRaw;
    } else if (typeof amountRaw === "string") {
      const n = Number(String(amountRaw).replace(/[^0-9.-]/g, ""));
      amount = Number.isFinite(n) ? n : null;
    }

    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    };

    let donation_date = str(parsed.donation_date);
    if (donation_date) {
      const m = donation_date.match(/^(\d{4}-\d{2}-\d{2})/);
      donation_date = m ? m[1] : null;
    }

    let donation_method = str(parsed.donation_method)?.toLowerCase() || null;
    const methodMap: Record<string, string> = {
      bank_transfer: "bank_transfer",
      bank: "bank_transfer",
      transfer: "bank_transfer",
      wire: "bank_transfer",
      cash: "cash",
      cheque: "cheque",
      check: "cheque",
      card: "card",
      whatsapp: "whatsapp",
      other: "other",
    };
    if (donation_method) {
      donation_method = methodMap[donation_method] || null;
    }

    return {
      amount: amount != null && amount > 0 ? amount : null,
      currency: str(parsed.currency)?.toUpperCase() || null,
      donation_date,
      donor_name: str(parsed.donor_name),
      donation_method,
      transaction_id: str(parsed.transaction_id),
      bank_name: str(parsed.bank_name),
      notes: str(parsed.notes),
    };
  }

  async extractFields(
    file: Express.Multer.File,
  ): Promise<ReceiptExtractedFields> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Receipt file is required");
    }

    const mime = this.resolveContentType(file);
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        "Receipt extraction supports JPEG, PNG, WebP, GIF, and PDF only",
      );
    }

    const prompt = this.buildPrompt();
    const base64 = file.buffer.toString("base64");
    const client = this.getClient();

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      mime === "application/pdf"
        ? [
            { type: "text", text: prompt },
            {
              type: "file",
              file: {
                filename: file.originalname || "receipt.pdf",
                file_data: `data:application/pdf;base64,${base64}`,
              },
            },
          ]
        : [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ];

    try {
      const completion = await client.chat.completions.create({
        model: this.getModel(),
        messages: [{ role: "user", content }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      return this.parseResponse(completion.choices[0]?.message?.content);
    } catch (err: any) {
      if (err instanceof HttpException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Receipt OpenAI extraction failed: ${err?.message || err}`);
      throw new HttpException(
        err?.message || "Failed to extract receipt data with AI",
        err?.status || 502,
      );
    }
  }
}
