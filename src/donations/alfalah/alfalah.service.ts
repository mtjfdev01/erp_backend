import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { buildApgRequestHash } from "./apg-hash.util";
import { appendDonationIdToReturnUrl } from "./apg-gateway-html.util";
import {
  AlfalahCredentials,
  isAlfalahSandbox,
  resolveAlfalahCredentials,
} from "./alfalah.credentials";

export type { AlfalahCredentials } from "./alfalah.credentials";

/**
 * Bank Alfalah APG — credit/debit card only (page redirection channel 1001).
 * Step 1: server POST HS/HS/HS (HS_IsRedirectionRequest=1) → AuthToken in JSON.
 * Step 2: browser POST SSO/SSO/SSO (form built on server, submitted from frontend).
 */
@Injectable()
export class AlfalahService {
  private readonly logger = new Logger(AlfalahService.name);

  getCredentials(): AlfalahCredentials {
    const resolved = resolveAlfalahCredentials();
    if (isAlfalahSandbox() && !process.env.APG_KEY1 && !process.env.APG_KEY2) {
      this.logger.debug(
        "Alfalah sandbox: using derived RequestHash keys until APG_KEY1/APG_KEY2 are set",
      );
    }
    return resolved;
  }

  private creds(): AlfalahCredentials {
    return this.getCredentials();
  }

  private currency(): string {
    return process.env.ALFALAH_CURRENCY || "PKR";
  }

  private buildCardHandshakeFieldList(
    transactionReference: string,
    isRedirectionRequest: "0" | "1" = "1",
  ): Array<[string, string]> {
    const c = this.creds();
    const hsReturnUrl = this.buildCardHsReturnUrl(transactionReference);
    return [
      ["HS_IsRedirectionRequest", isRedirectionRequest],
      ["HS_ChannelId", c.cardChannelId],
      ["HS_ReturnURL", hsReturnUrl],
      ["HS_MerchantId", c.merchantId],
      ["HS_StoreId", c.storeId],
      ["HS_MerchantHash", c.merchantHash],
      ["HS_MerchantUsername", c.merchantUsername],
      ["HS_MerchantPassword", c.merchantPassword],
      ["HS_TransactionReferenceNumber", transactionReference],
    ];
  }

  /** Legacy browser HS form (HS_IsRedirectionRequest=0) — prefer initiateCardHandshake(). */
  buildCardHandshakeForm(transactionReference: string): {
    action: string;
    fields: Record<string, string>;
  } {
    const c = this.creds();
    const fields = this.buildCardHandshakeFieldList(transactionReference, "0");
    const formFields: Record<string, string> = Object.fromEntries(fields);
    formFields.HS_RequestHash = buildApgRequestHash(fields, c.key1, c.key2);
    return {
      action: `${c.baseUrl}/HS/HS/HS`,
      fields: formFields,
    };
  }

  private parseHandshakeResponse(data: unknown): {
    success: boolean;
    authToken: string;
    returnUrl?: string;
    errorMessage?: string;
  } {
    let payload: unknown = data;
    if (typeof payload === "string") {
      const trimmed = payload.trim();
      if (!trimmed) {
        return {
          success: false,
          authToken: "",
          errorMessage: "Empty handshake response from APG",
        };
      }
      try {
        payload = JSON.parse(trimmed);
      } catch {
        return {
          success: false,
          authToken: "",
          errorMessage: "Invalid handshake response from APG",
        };
      }
    }

    const obj = (payload || {}) as Record<string, unknown>;
    const success = String(obj.success ?? "").toLowerCase() === "true";
    const authToken = String(
      obj.AuthToken ?? obj.authToken ?? obj.auth_token ?? "",
    ).trim();
    const returnUrl = String(obj.ReturnURL ?? obj.returnUrl ?? "").trim();
    const errorMessage = String(
      obj.ErrorMessage ?? obj.errorMessage ?? obj.message ?? "",
    ).trim();

    return { success, authToken, returnUrl, errorMessage };
  }

  /**
   * Step 1 — server POST {baseUrl}/HS/HS/HS (HS_IsRedirectionRequest=1).
   * Returns AuthToken from JSON for SSO step.
   */
  async initiateCardHandshake(transactionReference: string): Promise<{
    success: boolean;
    authToken: string;
    returnUrl?: string;
    errorMessage?: string;
  }> {
    const c = this.creds();
    const fields = this.buildCardHandshakeFieldList(transactionReference, "0"); 
    const formFields: Record<string, string> = Object.fromEntries(fields);
    console.log("formFields", formFields);
    formFields.HS_RequestHash = buildApgRequestHash(fields, c.key1, c.key2);

    const url = `${c.baseUrl}/HS/HS/HS`;
    this.logger.log(
      `Alfalah card handshake for order ${transactionReference} → ${url}`,
    );

    try {
      console.log("formFields", formFields);
      const { data, status } = await axios.post(url, new URLSearchParams(formFields), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 60000,
        validateStatus: () => true,
      });

      const parsed = this.parseHandshakeResponse(data);
      if (!parsed.success || !parsed.authToken) {
        const msg =
          parsed.errorMessage ||
          `Bank Alfalah handshake failed (HTTP ${status})`;
        this.logger.warn(`Alfalah handshake failed for ${transactionReference}: ${msg}`);
        throw new BadRequestException(msg);
      }

      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const msg =
        error instanceof Error ? error.message : "Bank Alfalah handshake failed";
      this.logger.error(`Alfalah handshake error for ${transactionReference}: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  /** HS_ReturnURL — public API; ?donationId= matches auth_token to order (merchant convention). */
  buildCardHsReturnUrl(transactionReference: string): string {
    const c = this.creds();
    const base =
      process.env.APG_HS_RETURN_URL ||
      c.hsReturnUrl ||
      c.returnUrl;
    return appendDonationIdToReturnUrl(base, transactionReference);
  }

  /** ReturnURL on SSO — donor returns here after card payment (APG sends O=order ref). */
  buildCardPaymentReturnUrl(transactionReference: string): string {
    const c = this.creds();
    return appendDonationIdToReturnUrl(c.returnUrl, transactionReference);
  }

  /**
   * Step 2 — POST {baseUrl}/SSO/SSO/SSO (ChannelId 1001, TransactionTypeId 3).
   * Returned to frontend after server handshake; legacy fallback via handleAlfalahReturn.
   */
  buildCardSsoForm(params: {
    authToken: string;
    transactionReference: string;
    amount: number;
  }): { action: string; fields: Record<string, string> } {
    const c = this.creds();
    const paymentReturnUrl = this.buildCardPaymentReturnUrl(
      params.transactionReference,
    );
    const amount = Number(params.amount);
    const fields: Array<[string, string]> = [
      ["AuthToken", params.authToken],
      ["ChannelId", c.cardChannelId],
      ["Currency", this.currency()],
      ["ReturnURL", paymentReturnUrl],
      ["MerchantId", c.merchantId],
      ["StoreId", c.storeId],
      ["MerchantHash", c.merchantHash],
      ["MerchantUsername", c.merchantUsername],
      ["MerchantPassword", c.merchantPassword],
      ["TransactionTypeId", "3"],
      ["TransactionReferenceNumber", params.transactionReference],
      ["TransactionAmount", Number.isFinite(amount) ? amount.toFixed(2) : "0.00"],
    ];
    const formFields: Record<string, string> = Object.fromEntries(fields);
    formFields.RequestHash = buildApgRequestHash(fields, c.key1, c.key2);
    return {
      action: `${c.baseUrl}/SSO/SSO/SSO`,
      fields: formFields,
    };
  }

  /** IPN — GET order status after payment redirect or listener. */
  async getOrderStatus(orderId: string): Promise<Record<string, any>> {
    const c = this.creds();
    const url = `${c.baseUrl}/HS/api/IPN/OrderStatus/${c.merchantId}/${c.storeId}/${encodeURIComponent(orderId)}`;
    const { data } = await axios.get(url, { timeout: 60000 });
    return data;
  }

  isPaidStatus(status: unknown): boolean {
    return String(status || "").toLowerCase() === "paid";
  }

  isSuccessResponseCode(code: unknown): boolean {
    return String(code || "") === "00";
  }
}

