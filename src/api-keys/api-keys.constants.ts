/** Header accepted by partner integrations (Ask Clinic, etc.). */
export const API_KEY_HEADER = "x-api-key";

/**
 * Known scopes for integration API keys.
 * Old donation partner keys stay on `external_api_keys` — do not mix.
 */
export const API_KEY_SCOPES = {
  ASK_CLINIC: "ask_clinic",
  ASK_CLINIC_BENEFICIARIES: "ask_clinic.beneficiaries",
} as const;

export type ApiKeyScope =
  (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES] | string;
