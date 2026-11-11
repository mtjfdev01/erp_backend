import { SetMetadata } from "@nestjs/common";

export const API_KEY_SCOPES_META = "api_key_required_scopes";

/** Require the caller’s API key to include at least one of these scopes. */
export const RequireApiKeyScopes = (...scopes: string[]) =>
  SetMetadata(API_KEY_SCOPES_META, scopes);
