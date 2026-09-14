import { randomBytes } from "crypto";

const CODE_PREFIX = "CMP";
const CODE_LENGTH = 8;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateComplaintCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let suffix = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${CODE_PREFIX}-${suffix}`;
}
