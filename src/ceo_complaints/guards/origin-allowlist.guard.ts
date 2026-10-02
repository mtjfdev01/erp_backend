import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

/** Origins allowed to call CEO public complaint APIs (website portal). */
export const CEO_COMPLAINT_PUBLIC_ORIGINS = [
  "http://localhost:3001",
  "https://mtjfoundation.org",
  "https://www.mtjfoundation.org",
  "https://mtjf-site.vercel.app",
] as const;

/**
 * Blocks public CEO complaint endpoints unless Origin is on the allowlist.
 * Also accepts matching Referer when Origin is missing (some browsers/proxies).
 */
@Injectable()
export class OriginAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const origin = String(request.headers?.origin || "").trim();
    const referer = String(request.headers?.referer || "").trim();

    if (origin && CEO_COMPLAINT_PUBLIC_ORIGINS.includes(origin as any)) {
      return true;
    }

    if (
      !origin &&
      referer &&
      CEO_COMPLAINT_PUBLIC_ORIGINS.some((allowed) =>
        referer.startsWith(allowed),
      )
    ) {
      return true;
    }

    throw new ForbiddenException(
      "This endpoint is only available from allowed websites",
    );
  }
}
