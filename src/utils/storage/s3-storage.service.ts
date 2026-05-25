import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import {
  S3_BUCKET_PROFILE,
  S3BucketProfileId,
  profileToEnvKey,
} from "./s3-bucket-profile";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type AppealImagePurpose =
  | "cover"
  | "organizer"
  | "beneficiary"
  | "gallery";

interface ResolvedS3Profile {
  profileId: string;
  bucket: string;
  prefix: string;
  publicBaseUrl?: string;
  objectAcl?: string;
  maxFileMb: number;
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): S3Client {
    if (this.client) return this.client;

    const accessKeyId = this.config.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("AWS_SECRET_ACCESS_KEY");
    const region =
      this.config.get<string>("AWS_REGION") ||
      this.config.get<string>("AWS_DEFAULT_REGION") ||
      "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        "AWS S3 is not configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)",
      );
    }

    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  private getDefaultBucket(): string {
    const bucket = this.config.get<string>("AWS_S3_BUCKET");
    if (!bucket) {
      throw new InternalServerErrorException("AWS_S3_BUCKET is not configured");
    }
    return bucket;
  }

  /**
   * Resolve bucket + path prefix + optional overrides for a module profile.
   * Appeals and other modules can share AWS_S3_BUCKET or set AWS_S3_<PROFILE>_BUCKET.
   */
  resolveProfile(profileId: S3BucketProfileId): ResolvedS3Profile {
    const id = profileId || S3_BUCKET_PROFILE.DEFAULT;
    const envKey = profileToEnvKey(id);

    const bucket =
      id === S3_BUCKET_PROFILE.DEFAULT
        ? this.getDefaultBucket()
        : this.config.get<string>(`AWS_S3_${envKey}_BUCKET`) ||
          this.getDefaultBucket();

    const prefixRaw =
      this.config.get<string>(`AWS_S3_${envKey}_PREFIX`) ??
      (id === S3_BUCKET_PROFILE.DEFAULT ? "" : id);
    const prefix = String(prefixRaw).replace(/^\/|\/$/g, "");

    const publicBaseUrl =
      this.config.get<string>(`AWS_S3_${envKey}_PUBLIC_BASE_URL`) ||
      this.config.get<string>("AWS_S3_PUBLIC_BASE_URL");

    const objectAcl =
      this.config.get<string>(`AWS_S3_${envKey}_OBJECT_ACL`) ||
      this.config.get<string>("AWS_S3_OBJECT_ACL");

    const maxFileMb = Number(
      this.config.get<string>(`AWS_S3_${envKey}_MAX_FILE_MB`) ||
        this.config.get<string>("AWS_S3_MAX_FILE_MB") ||
        5,
    );

    return {
      profileId: id,
      bucket,
      prefix,
      publicBaseUrl,
      objectAcl,
      maxFileMb,
    };
  }

  buildPublicUrl(key: string, profile?: ResolvedS3Profile): string {
    const p = profile ?? this.resolveProfile(S3_BUCKET_PROFILE.DEFAULT);
    if (p.publicBaseUrl) {
      return `${p.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    }
    const region =
      this.config.get<string>("AWS_REGION") ||
      this.config.get<string>("AWS_DEFAULT_REGION") ||
      "us-east-1";
    return `https://${p.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  validateImageFile(
    file: Express.Multer.File,
    maxFileMb?: number,
  ): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException("No file uploaded");
    }
    const mime = (file.mimetype || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        "Only JPEG, PNG, WebP, and GIF images are allowed",
      );
    }
    const limitMb = maxFileMb ?? Number(this.config.get("AWS_S3_MAX_FILE_MB") || 5);
    if (file.size > limitMb * 1024 * 1024) {
      throw new BadRequestException(`Image must be under ${limitMb}MB`);
    }
  }

  /**
   * Generic image upload for any bucket profile.
   * @param pathSegments folders under the profile prefix (e.g. ["cover"] for appeals)
   */
  async uploadImage(
    profileId: S3BucketProfileId,
    file: Express.Multer.File,
    pathSegments: string[] = [],
  ): Promise<{ url: string; key: string; bucket: string; profile: string }> {
    const profile = this.resolveProfile(profileId);
    this.validateImageFile(file, profile.maxFileMb);

    const ext =
      EXT_BY_MIME[(file.mimetype || "").toLowerCase()] ||
      file.originalname?.split(".").pop()?.toLowerCase() ||
      "jpg";
    const safeName = (file.originalname || `image.${ext}`)
      .replace(/[^\w.-]/g, "_")
      .slice(0, 80);
    const filePart = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;

    const parts = [
      profile.prefix,
      ...pathSegments.map((s) => s.replace(/^\/|\/$/g, "")),
      filePart,
    ].filter(Boolean);
    const key = parts.join("/");

    const putParams: {
      Bucket: string;
      Key: string;
      Body: Buffer;
      ContentType: string;
      ACL?: ObjectCannedACL;
    } = {
      Bucket: profile.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    if (profile.objectAcl && profile.objectAcl !== "none") {
      putParams.ACL = profile.objectAcl as ObjectCannedACL;
    }

    try {
      await this.getClient().send(new PutObjectCommand(putParams));
    } catch (err: any) {
      this.logger.error(
        `S3 upload failed [profile=${profileId}, bucket=${profile.bucket}]: ${err?.message || err}`,
      );
      throw new InternalServerErrorException(
        "Failed to upload image to storage",
      );
    }

    return {
      url: this.buildPublicUrl(key, profile),
      key,
      bucket: profile.bucket,
      profile: profile.profileId,
    };
  }

  /** Appeals images — uses profile `appeals` (same bucket as default unless AWS_S3_APPEALS_BUCKET is set). */
  async uploadAppealImage(
    file: Express.Multer.File,
    purpose: AppealImagePurpose,
  ): Promise<{ url: string; key: string }> {
    const result = await this.uploadImage(
      S3_BUCKET_PROFILE.APPEALS,
      file,
      [purpose],
    );
    return { url: result.url, key: result.key };
  }
}
