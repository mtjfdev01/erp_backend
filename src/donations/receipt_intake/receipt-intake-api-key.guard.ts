import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import {
  RECEIPT_INTAKE_API_KEY_ENV,
  RECEIPT_INTAKE_API_KEY_HEADER,
} from "./receipt-intake.constants";

@Injectable()
export class ReceiptIntakeApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = String(
      this.configService.get<string>(RECEIPT_INTAKE_API_KEY_ENV) || "",
    ).trim();
    if (!expected) {
      throw new UnauthorizedException(
        `${RECEIPT_INTAKE_API_KEY_ENV} is not configured`,
      );
    }

    const request = context.switchToHttp().getRequest();
    const provided = String(
      request.headers?.[RECEIPT_INTAKE_API_KEY_HEADER] ||
        request.headers?.["authorization"]?.replace(/^Bearer\s+/i, "") ||
        "",
    ).trim();

    if (!provided || !this.keysMatch(provided, expected)) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }

  private keysMatch(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
