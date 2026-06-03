import { Injectable, Logger } from "@nestjs/common";
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
 * @see APG Merchant Integration Guide — Credit/Debit Card Payment Method
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

  /** Step 1 — POST form to HS/HS/HS (APG card handshake). */
  buildCardHandshakeForm(transactionReference: string): {
    action: string;
    fields: Record<string, string>;
  } {
    const c = this.creds();
    const hsReturnUrl = this.buildCardHsReturnUrl(transactionReference);
    const fields: Array<[string, string]> = [
      // 0 = APG redirects donor to HS_ReturnURL with auth_token (APG guide step 2)
      ["HS_IsRedirectionRequest", "0"],
      ["HS_ChannelId", c.cardChannelId],
      ["HS_ReturnURL", hsReturnUrl],
      ["HS_MerchantId", c.merchantId],
      ["HS_StoreId", c.storeId],
      ["HS_MerchantHash", c.merchantHash],
      ["HS_MerchantUsername", c.merchantUsername],
      ["HS_MerchantPassword", c.merchantPassword],
      ["HS_TransactionReferenceNumber", transactionReference],
    ];
    const formFields: Record<string, string> = Object.fromEntries(fields);
    formFields.HS_RequestHash = buildApgRequestHash(fields, c.key1, c.key2);
    return {
      action: `${c.baseUrl}/HS/HS/HS`,
      fields: formFields,
    };
  }

  /** HS_ReturnURL — public API; ?donationId= helps match AuthToken to order (merchant convention). */
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

  /** Step 2 — POST form to SSO/SSO/SSO after AuthToken on /alfalah/return. */
  buildCardSsoForm(params: {
    authToken: string;
    transactionReference: string;
    amount: number;
  }): { action: string; fields: Record<string, string> } {
    const c = this.creds();
    const paymentReturnUrl = this.buildCardPaymentReturnUrl(
      params.transactionReference,
    );
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
      ["TransactionAmount", String(params.amount)],
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
