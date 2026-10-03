import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthRequestUserService } from "./auth-request-user.service";
import {
  attachEnrichedUserToRequest,
  extractJwtFromCookie,
} from "./jwt-user.util";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authRequestUserService: AuthRequestUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractJwtFromCookie(request);

    if (!token) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "No token provided",
        code: "SESSION_EXPIRED",
      });
    }

    try {
      await attachEnrichedUserToRequest(
        request,
        this.jwtService,
        this.authRequestUserService,
        token,
      );
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
