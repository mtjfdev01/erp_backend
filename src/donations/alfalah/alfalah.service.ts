import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { buildApgRequestHash } from "./apg-hash.util";
import {
  AlfalahCredentials,
  isAlfalahSandbox,
  resolveAlfalahCredentials,
} from "./alfalah.credentials";

export type { AlfalahCredentials } from "./alfalah.credentials";
export type AlfalahTransactionType = "1" | "2" | "3";

@Injectable()
export class AlfalahService {
  private readonly logger = new Logger(AlfalahService.name);

  getCredentials(): AlfalahCredentials {
    const resolved = resolveAlfalahCredentials();
    if (isAlfalahSandbox() && !process.env.APG_KEY1 && !process.env.APG_KEY2) {
      this.logger.debug(
        `Alfalah sandbox: using derived RequestHash keys (set APG_KEY1/APG_KEY2 from portal when available)`,
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

  private async postJson<T = any>(url: string, body: Record<string, string>): Promise<T> {
    const { data } = await axios.post<T>(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    });
    return data;
  }

  /** Step 1 — Initiate Handshake (wallet / account REST flow). */
  async initiateHandshake(transactionReference: string): Promise<{
    success: boolean;
    authToken?: string;
    returnUrl?: string;
    errorMessage?: string;
  }> {
    const c = this.creds();
    const fields: Array<[string, string]> = [
      ["HS_ChannelId", c.apiChannelId],
      ["HS_MerchantId", c.merchantId],
      ["HS_StoreId", c.storeId],
      ["HS_ReturnURL", c.returnUrl],
      ["HS_MerchantHash", c.merchantHash],
      ["HS_MerchantUsername", c.merchantUsername],
      ["HS_MerchantPassword", c.merchantPassword],
      ["HS_TransactionReferenceNumber", transactionReference],
    ];
    const body: Record<string, string> = Object.fromEntries(fields);
    body.HS_RequestHash = buildApgRequestHash(fields, c.key1, c.key2);

    const url = `${c.baseUrl}/HS/api/HSAPI/HSAPI`;
    this.logger.log(`APG Handshake for order ${transactionReference}`);
    const data = await this.postJson(url, body);
    const success = String(data?.success).toLowerCase() === "true";
    return {
      success,
      authToken: data?.AuthToken,
      returnUrl: data?.ReturnURL,
      errorMessage: data?.ErrorMessage,
    };
  }

  /** Step 2 — Initiate Transaction (DoTran). APG sends OTP/OTAC to donor mobile/email. */
  async initiateTransaction(params: {
    authToken: string;
    transactionTypeId: AlfalahTransactionType;
    transactionReference: string;
    amount: number;
    accountNumber: string;
    email: string;
    mobile: string;
    country?: string;
  }): Promise<{
    success: boolean;
    authToken?: string;
    hashKey?: string;
    isOtp?: boolean;
    errorMessage?: string;
  }> {
    const c = this.creds();
    const fields: Array<[string, string]> = [
      ["ChannelId", c.apiChannelId],
      ["MerchantId", c.merchantId],
      ["StoreId", c.storeId],
      ["MerchantHash", c.merchantHash],
      ["MerchantUsername", c.merchantUsername],
      ["MerchantPassword", c.merchantPassword],
      ["ReturnURL", c.returnUrl],
      ["Currency", this.currency()],
      ["AuthToken", params.authToken],
      ["TransactionTypeId", params.transactionTypeId],
      ["TransactionReferenceNumber", params.transactionReference],
      ["TransactionAmount", String(params.amount)],
      ["AccountNumber", params.accountNumber],
      ["Country", params.country || c.defaultCountry],
      ["EmailAddress", params.email],
      ["MobileNumber", params.mobile],
    ];
    const body: Record<string, string> = Object.fromEntries(fields);
    body.RequestHash = buildApgRequestHash(fields, c.key1, c.key2);

    const url = `${c.baseUrl}/HS/api/Tran/DoTran`;
    const data = await this.postJson(url, body);
    const success = String(data?.success).toLowerCase() === "true";
    return {
      success,
      authToken: data?.AuthToken,
      hashKey: data?.HashKey,
      isOtp: String(data?.IsOTP).toLowerCase() === "true",
      errorMessage: data?.ErrorMessage,
    };
  }

  /** Step 3 — Process Transaction (ProTran) with OTP from donor. */
  async processTransaction(params: {
    authToken: string;
    hashKey: string;
    transactionTypeId: AlfalahTransactionType;
    transactionReference: string;
    isOtp: boolean;
    smsOtp?: string;
    smsOtac?: string;
    emailOtac?: string;
  }): Promise<Record<string, any>> {
    const c = this.creds();
    const fields: Array<[string, string]> = [
      ["ChannelId", c.apiChannelId],
      ["MerchantId", c.merchantId],
      ["StoreId", c.storeId],
      ["MerchantHash", c.merchantHash],
      ["MerchantUsername", c.merchantUsername],
      ["MerchantPassword", c.merchantPassword],
      ["ReturnURL", c.returnUrl],
      ["Currency", this.currency()],
      ["AuthToken", params.authToken],
      ["TransactionTypeId", params.transactionTypeId],
      ["TransactionReferenceNumber", params.transactionReference],
      ["SMSOTAC", params.smsOtac ?? ""],
      ["EmailOTAC", params.emailOtac ?? ""],
      ["SMSOTP", params.smsOtp ?? ""],
      ["HashKey", params.hashKey],
    ];
    const body: Record<string, string> = Object.fromEntries(fields);
    body.RequestHash = buildApgRequestHash(fields, c.key1, c.key2);

    const url = `${c.baseUrl}/HS/api/ProcessTran/ProTran`;
    return this.postJson(url, body);
  }

  /** IPN — GET order status (authoritative after redirect/listener). */
  async getOrderStatus(orderId: string): Promise<Record<string, any>> {
    const c = this.creds();
    const url = `${c.baseUrl}/HS/api/IPN/OrderStatus/${c.merchantId}/${c.storeId}/${encodeURIComponent(orderId)}`;
    const { data } = await axios.get(url, { timeout: 60000 });
    return data;
  }

  /** Card flow step 1 — form fields for POST to HS/HS/HS. */
  buildCardHandshakeForm(transactionReference: string): {
    action: string;
    fields: Record<string, string>;
  } {
    const c = this.creds();
    const fields: Array<[string, string]> = [
      ["HS_IsRedirectionRequest", "0"],
      ["HS_ChannelId", c.cardChannelId],
      ["HS_ReturnURL", c.returnUrl],
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

  /** Card flow step 2 — form fields for POST to SSO/SSO/SSO. */
  buildCardSsoForm(params: {
    authToken: string;
    transactionReference: string;
    amount: number;
  }): { action: string; fields: Record<string, string> } {
    const c = this.creds();
    const fields: Array<[string, string]> = [
      ["AuthToken", params.authToken],
      ["ChannelId", c.cardChannelId],
      ["Currency", this.currency()],
      ["ReturnURL", c.returnUrl],
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

  isPaidStatus(status: unknown): boolean {
    return String(status || "").toLowerCase() === "paid";
  }

  isSuccessResponseCode(code: unknown): boolean {
    return String(code || "") === "00";
  }
}
