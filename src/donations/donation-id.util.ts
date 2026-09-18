import * as crypto from "crypto";

/** Public donation_public_id length (hex characters). */
export const DONATION_PUBLIC_ID_LENGTH = 12;

/** Bytes needed for hex length (2 hex chars per byte). */
export const DONATION_PUBLIC_ID_BYTES = DONATION_PUBLIC_ID_LENGTH / 2;

/** Cryptographically random 12-char lowercase hex (no uniqueness check). */
export function generateDonationPublicIdCandidate(): string {
  return crypto.randomBytes(DONATION_PUBLIC_ID_BYTES).toString("hex");
}

export function isValidDonationPublicId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{12}$/.test(value.trim().toLowerCase());
}

/** Website checkout URL — only donation_public_id (never numeric id). */
export function buildWebsiteCheckoutUrl(
  donationPublicId: string,
  baseUrl?: string | null,
): string {
  const base = String(
    baseUrl || process.env.BASE_Frontend_URL || "https://mtjfoundation.org",
  ).replace(/\/$/, "");
  const id = String(donationPublicId || "")
    .trim()
    .toLowerCase();
  return `${base}/checkout?donation_public_id=${encodeURIComponent(id)}`;
}
