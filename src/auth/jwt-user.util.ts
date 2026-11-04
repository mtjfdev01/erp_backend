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

export function extractJwtFromCookie(request: Request): string | undefined {
  if (request.cookies?.jwt) {
    return request.cookies.jwt;
  }
  const auth = request.headers?.authorization;
  if (auth && typeof auth === "string") {
    const parts = auth.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
    return auth;
  }
  if (request.headers?.cookie) {
    const match = request.headers.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return undefined;
}
