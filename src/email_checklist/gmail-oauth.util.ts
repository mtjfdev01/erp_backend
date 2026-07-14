import type { Request } from "express";

export function buildGmailOAuthRedirectUri(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || req.protocol || "http";

  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.get("host") || "localhost:3000";

  return `${protocol}://${host}/email-checklist/gmail/callback`;
}
