import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { ExternalApiKeysService } from "../external-api-keys.service";

/**
 * Validates partner requests against DB table `external_api_keys`
 * (active + not archived). No env-based key.
 *
 * Headers: `X-Api-Key` or `Authorization: Bearer <key>` / `ApiKey <key>`.
 */
@Injectable()
export class ExternalApiKeyGuard implements CanActivate {
  constructor(private readonly keysService: ExternalApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = this.extractApiKey(req);

    if (!provided) {
      throw new UnauthorizedException("Missing API key");
    }

    // Lookup in external_api_keys table
    const row = await this.keysService.findActiveByKey(provided);
    if (!row) {
      throw new UnauthorizedException("Invalid or inactive API key");
    }

    void this.keysService.touchLastUsed(row.id).catch(() => undefined);

    (req as any).user = {
      id: -1,
      role: "external_api",
      external_api_key_id: row.id,
      partner_name: row.partner_name,
      donation_source: row.donation_source,
    };
    (req as any).externalPartner = row;
    return true;
  }

  private extractApiKey(req: Request): string {
    const headerKey = String(req.headers["x-api-key"] || "").trim();
    if (headerKey) return headerKey;

    const auth = String(req.headers.authorization || "").trim();
    if (/^bearer\s+/i.test(auth)) {
      return auth.replace(/^bearer\s+/i, "").trim();
    }
    if (/^apikey\s+/i.test(auth)) {
      return auth.replace(/^apikey\s+/i, "").trim();
    }
    return "";
  }
}
