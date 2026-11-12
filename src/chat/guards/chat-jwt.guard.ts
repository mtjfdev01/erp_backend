import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthRequestUserService } from "../../auth/auth-request-user.service";

/**
 * Dedicated JWT Guard for the Chat & Collaboration Module.
 * Authenticates requests across multiple transport methods:
 * 1. HTTP-only cookies ('jwt') from same-origin ERP web frontend.
 * 2. Authorization 'Bearer <token>' headers from decoupled clients (ChatTask, mobile apps).
 * 3. Raw cookie header fallback regex matching.
 * 4. Query token fallback for direct asset downloads.
 */
@Injectable()
export class ChatJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authRequestUserService: AuthRequestUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Check for public bypass origins
    const origin = (request.headers.origin as string) || "";
    if (
      origin === "http://localhost:3001" ||
      origin === "https://donation.mtjfoundation.org" ||
      origin === "https://mtjf-site.vercel.app" ||
      origin === "https://mtjfoundation.org" ||
      origin === "https://www.mtjfoundation.org" ||
      origin.includes("18.143.123.75")
    ) {
      request["user"] = {
        id: -1,
        email: "public@system",
        role: "public_donor",
        department: "system",
        permissions: {},
      };
      return true;
    }

    // 2. Extract token from Cookie, Bearer Header, Raw Cookie, or Query
    let token: string | undefined;

    // A. HTTP-only parsed cookie
    if (request.cookies?.jwt) {
      token = request.cookies.jwt;
    }

    // B. Authorization header ('Bearer <token>')
    if (!token && request.headers?.authorization) {
      const auth = request.headers.authorization;
      if (typeof auth === "string") {
        const parts = auth.split(" ");
        if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
          token = parts[1];
        } else {
          token = auth;
        }
      }
    }

    // C. Raw Cookie header fallback
    if (!token && request.headers?.cookie) {
      const match = request.headers.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    // D. Query token fallback
    if (!token && request.query?.token) {
      token = String(request.query.token);
    }

    if (!token) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "No token provided",
        code: "SESSION_EXPIRED",
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || "your-secret-key",
      });
      request["user"] = await this.authRequestUserService.enrichJwtPayload(payload);
      return true;
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Invalid token",
        code: "SESSION_EXPIRED",
      });
    }
  }
}
