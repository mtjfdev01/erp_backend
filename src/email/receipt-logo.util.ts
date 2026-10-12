/** Public MTJF logo for receipt emails (email clients cannot load local/server files). */
export const DEFAULT_RECEIPT_LOGO_URL =
  "https://amzn-s3-mtjf.s3.eu-north-1.amazonaws.com/fards/logo.png";

/**
 * Logo URL for donation receipts.
 * `DONATION_RECEIPT_LOGO_URL` env overrides; otherwise uses the public MTJF CDN URL.
 */
export function getReceiptLogoUrl(): string {
  const fromEnv = process.env.DONATION_RECEIPT_LOGO_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_RECEIPT_LOGO_URL;
}
