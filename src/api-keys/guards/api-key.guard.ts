import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { API_KEY_SCOPES_META } from "../decorators/require-api-key-scopes.decorator";
import { ApiKeysService } from "../api-keys.service";

/**
 * Validates `x-api-key` (or Bearer / ApiKey Authorization) against table `api_keys`.
 * Optional @RequireApiKeyScopes(...) — key must include at least one listed scope.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keysService: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = this.extractApiKey(req);
    if (!provided) {
      throw new UnauthorizedException("Missing API key");
    }

    const row = await this.keysService.findActiveByKey(provided);
    if (!row) {
      throw new UnauthorizedException("Invalid or inactive API key");
    }

    const requiredScopes =
      this.reflector.getAllAndOverride<string[]>(API_KEY_SCOPES_META, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (requiredScopes.length) {
      const keyScopes = Array.isArray(row.scopes)
        ? row.scopes.map((s) => String(s || "").trim()).filter(Boolean)
        : [];
      const ok = requiredScopes.some((s) => keyScopes.includes(s));
      if (!ok) {
        throw new ForbiddenException(
          `API key missing required scope (${requiredScopes.join(" | ")})`,
        );
      }
    }

    void this.keysService.touchLastUsed(row.id).catch(() => undefined);

    (req as any).user = {
      id: -1,
      role: "api_key",
      api_key_id: row.id,
      partner_name: row.name,
      scopes: row.scopes || [],
    };
    (req as any).apiKeyPartner = row;
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
