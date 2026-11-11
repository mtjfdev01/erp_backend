import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthRequestUserService } from "./auth-request-user.service";

export async function attachEnrichedUserToRequest(
  request: Request,
  jwtService: JwtService,
  authRequestUserService: AuthRequestUserService,
  token: string | undefined,
): Promise<void> {
  if (!token) return;

  const payload = await jwtService.verifyAsync(token, {
    secret: process.env.JWT_SECRET || "your-secret-key",
  });
  request["user"] = await authRequestUserService.enrichJwtPayload(payload);
}

/**
 * Extracts a JWT authentication token from the incoming HTTP request.
 * Supports dual authentication transport mechanisms:
 * 1. HTTP-only cookie ('jwt') used by the same-origin ERP web frontend (mtjf_erp_fe).
 * 2. Authorization 'Bearer <token>' header used by decoupled clients (such as ChatTask),
 *    mobile apps, and external REST API integrations.
 * 3. Raw Cookie header fallback if cookie-parser middleware has not yet processed the request.
 */
export function extractJwtFromCookie(request: Request): string | undefined {
  // 1. Primary Cookie extraction: parsed HTTP-only cookie
  if (request.cookies?.jwt) {
    return request.cookies.jwt;
  }

  // 2. Authorization Header extraction: Bearer token for API & ChatTask clients
  const auth = request.headers?.authorization;
  if (auth && typeof auth === "string") {
    const parts = auth.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
    return auth;
  }

  // 3. Raw Cookie header fallback regex match
  if (request.headers?.cookie) {
    const match = request.headers.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  return undefined;
}
