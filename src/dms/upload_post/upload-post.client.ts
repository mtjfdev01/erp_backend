import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface UploadPostProfile {
  username: string;
  display_name?: string | null;
  social_accounts?: Record<string, unknown>;
  created_at?: string;
}

export interface UploadPhotosPayload {
  user: string;
  platforms: string[];
  photoUrls: string[];
  title?: string | null;
  description?: string | null;
  scheduledDate?: string | null;
  firstComment?: string | null;
  facebookPageId?: string | null;
  targetLinkedinPageId?: string | null;
  externalId?: string | null;
  asyncUpload?: boolean;
}

export interface UploadPhotosResult {
  success: boolean;
  post_id?: string;
  request_id?: string;
  job_id?: string;
  warnings?: string[];
  results?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UploadStatusResult {
  success?: boolean;
  status?: string;
  completed?: number;
  total?: number;
  results?: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class UploadPostClient {
  private readonly logger = new Logger(UploadPostClient.name);
  private readonly apiUrl = "https://api.upload-post.com/api";

  constructor(private readonly config: ConfigService) {}

  private getApiKey(): string {
    const key = this.config.get<string>("UPLOAD_POST_API_KEY");
    if (!key?.trim()) {
      throw new HttpException(
        "Upload-Post is not configured. Set UPLOAD_POST_API_KEY in environment.",
        500,
      );
    }
    return key.trim();
  }

  getDefaultUser(): string | null {
    const user = this.config.get<string>("UPLOAD_POST_USER");
    return user?.trim() || null;
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Apikey ${this.getApiKey()}`,
      ...(extra || {}),
    };
  }

  async listProfiles(): Promise<UploadPostProfile[]> {
    const res = await fetch(`${this.apiUrl}/uploadposts/users`, {
      method: "GET",
      headers: this.authHeaders(),
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      profiles?: UploadPostProfile[];
      message?: string;
      error?: string;
    };

    if (!res.ok || json.success === false) {
      const msg =
        json.message || json.error || `Upload-Post users error (${res.status})`;
      this.logger.warn(msg);
      throw new HttpException(msg, res.status >= 400 ? res.status : 502);
    }

    return json.profiles ?? [];
  }

  async listFacebookPages(user?: string): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (user?.trim()) params.set("user", user.trim());
    const qs = params.toString();
    const url = `${this.apiUrl}/uploadposts/facebook/pages${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.authHeaders(),
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      pages?: unknown[];
      data?: unknown[];
      message?: string;
      error?: string;
    };

    if (!res.ok || json.success === false) {
      const msg =
        json.message ||
        json.error ||
        `Upload-Post Facebook pages error (${res.status})`;
      this.logger.warn(msg);
      throw new HttpException(msg, res.status >= 400 ? res.status : 502);
    }

    return json.pages || json.data || [];
  }

  async uploadPhotos(payload: UploadPhotosPayload): Promise<UploadPhotosResult> {
    const form = new FormData();
    form.append("user", payload.user);

    for (const platform of payload.platforms) {
      form.append("platform[]", platform);
    }

    for (const url of payload.photoUrls) {
      form.append("photos[]", url);
    }

    if (payload.title?.trim()) {
      form.append("title", payload.title.trim());
    }
    if (payload.description?.trim()) {
      form.append("description", payload.description.trim());
    }
    if (payload.scheduledDate) {
      form.append("scheduled_date", payload.scheduledDate);
    }
    if (payload.firstComment?.trim()) {
      form.append("first_comment", payload.firstComment.trim());
    }
    if (payload.facebookPageId?.trim()) {
      form.append("facebook_page_id", payload.facebookPageId.trim());
    }
    if (payload.targetLinkedinPageId?.trim()) {
      form.append(
        "target_linkedin_page_id",
        payload.targetLinkedinPageId.trim(),
      );
    }
    if (payload.externalId?.trim()) {
      form.append("external_id", payload.externalId.trim());
    }
    if (payload.asyncUpload) {
      form.append("async_upload", "true");
    }

    const res = await fetch(`${this.apiUrl}/upload_photos`, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
    });

    const json = (await res.json().catch(() => ({}))) as UploadPhotosResult;

    if (!res.ok || json.success === false) {
      const msg =
        (json as any).message ||
        (json as any).error ||
        `Upload-Post upload_photos error (${res.status})`;
      this.logger.warn(msg);
      throw new HttpException(msg, res.status >= 400 ? res.status : 502);
    }

    return json;
  }

  async getUploadStatus(requestId: string): Promise<UploadStatusResult> {
    const params = new URLSearchParams({ request_id: requestId });
    const res = await fetch(
      `${this.apiUrl}/uploadposts/status?${params.toString()}`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    );

    const json = (await res.json().catch(() => ({}))) as UploadStatusResult;

    if (!res.ok || json.success === false) {
      const msg =
        (json as any).message ||
        (json as any).error ||
        `Upload-Post status error (${res.status})`;
      this.logger.warn(msg);
      throw new HttpException(msg, res.status >= 400 ? res.status : 502);
    }

    return json;
  }
}
