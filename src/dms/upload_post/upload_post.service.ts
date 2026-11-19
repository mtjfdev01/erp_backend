import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  UploadPost,
  UploadPostStatus,
  UPLOAD_POST_PHOTO_PLATFORMS,
} from "./entities/upload-post.entity";
import { CreateUploadPostDto } from "./dto/create-upload-post.dto";
import { UpdateUploadPostDto } from "./dto/update-upload-post.dto";
import { UploadPostClient } from "./upload-post.client";
import {
  LOOKUP_PROFILES,
  listEntityLookup,
  type EntityLookupParams,
  type LookupOption,
} from "../../utils/lookup";

const SORTABLE = new Set([
  "id",
  "created_at",
  "updated_at",
  "scheduled_at",
  "status",
]);

const ALLOWED_PLATFORMS = new Set<string>(UPLOAD_POST_PHOTO_PLATFORMS);

@Injectable()
export class UploadPostService {
  constructor(
    @InjectRepository(UploadPost)
    private readonly uploadPostRepo: Repository<UploadPost>,
    private readonly uploadPostClient: UploadPostClient,
  ) {}

  private pickAuditActor(user: any) {
    if (!user || typeof user !== "object") return null;
    return {
      id: user.id,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      email: user.email || null,
    };
  }

  private normalizePhotoUrls(dto: {
    photo_urls?: string[];
    image_url?: string;
  }): string[] {
    const urls = [
      ...(Array.isArray(dto.photo_urls) ? dto.photo_urls : []),
      ...(dto.image_url ? [dto.image_url] : []),
    ]
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    return Array.from(new Set(urls));
  }

  private normalizePlatforms(platforms?: string[]): string[] {
    if (!platforms?.length) return [];
    const cleaned = platforms
      .map((p) => String(p || "").trim().toLowerCase())
      .filter(Boolean);

    for (const p of cleaned) {
      if (p === "youtube") {
        throw new BadRequestException(
          "YouTube is not supported on the photo endpoint. Use Upload Video for YouTube.",
        );
      }
      if (!ALLOWED_PLATFORMS.has(p)) {
        throw new BadRequestException(
          `Unsupported platform "${p}". Allowed: ${[...ALLOWED_PLATFORMS].join(", ")}`,
        );
      }
    }
    return Array.from(new Set(cleaned));
  }

  async listForLookup(params?: EntityLookupParams): Promise<LookupOption[]> {
    const options = await listEntityLookup(
      this.uploadPostRepo,
      {
        profile: LOOKUP_PROFILES.upload_posts,
        searchFields: ["title", "description", "upload_post_user"],
        orderBy: "id",
        labelFallback: (row) => `Upload Post #${row.id}`,
      },
      params,
    );
    return options.map((opt) => ({
      ...opt,
      label:
        opt.label.length > 80 ? `${opt.label.slice(0, 77)}...` : opt.label,
    }));
  }

  async search(payload: Record<string, any>) {
    const pagination = payload.pagination || {};
    const page = Math.max(1, Number(pagination.page) || 1);
    let pageSize = Number(pagination.pageSize);
    if (!Number.isFinite(pageSize)) pageSize = 10;
    if (pagination.pageSize === 0) pageSize = 0;

    const sortField = SORTABLE.has(pagination.sortField)
      ? pagination.sortField
      : "created_at";
    const sortOrder =
      String(pagination.sortOrder || "DESC").toUpperCase() === "ASC"
        ? "ASC"
        : "DESC";

    const filters = payload.filters || payload;

    const qb = this.uploadPostRepo
      .createQueryBuilder("up")
      .where("up.is_archived = false");

    if (filters.status) {
      qb.andWhere("up.status = :status", { status: filters.status });
    }
    if (filters.campaign_id) {
      qb.andWhere("up.campaign_id = :campaignId", {
        campaignId: Number(filters.campaign_id),
      });
    }
    if (filters.appeal_id) {
      qb.andWhere("up.appeal_id = :appealId", {
        appealId: Number(filters.appeal_id),
      });
    }
    if (filters.platform) {
      qb.andWhere("up.platforms @> :platformJson", {
        platformJson: JSON.stringify([String(filters.platform).toLowerCase()]),
      });
    }
    if (filters.search) {
      const term = `%${String(filters.search).trim()}%`;
      qb.andWhere(
        "(up.title ILIKE :term OR up.description ILIKE :term OR up.upload_post_user ILIKE :term)",
        { term },
      );
    }

    const total = await qb.clone().getCount();
    qb.orderBy(`up.${sortField}`, sortOrder);
    if (pageSize > 0) {
      qb.skip((page - 1) * pageSize).take(pageSize);
    }

    const data = await qb.getMany();
    const totalPages =
      pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

    return {
      data,
      pagination: { page, pageSize, total, totalPages },
    };
  }

  async findOne(id: number): Promise<UploadPost> {
    const row = await this.uploadPostRepo.findOne({
      where: { id, is_archived: false },
      relations: ["created_by"],
    });
    if (!row) {
      throw new NotFoundException("Upload post not found");
    }
    (row as any).created_by = this.pickAuditActor((row as any).created_by);
    return row;
  }

  async create(dto: CreateUploadPostDto): Promise<UploadPost> {
    const photoUrls = this.normalizePhotoUrls(dto);
    const platforms = this.normalizePlatforms(dto.platforms);
    const title = dto.title?.trim() || null;
    const description = dto.description?.trim() || null;

    if (!title && !description && photoUrls.length === 0) {
      throw new BadRequestException("Title, description, or photo is required");
    }

    const row = this.uploadPostRepo.create({
      campaign_id: dto.campaign_id ?? null,
      appeal_id: dto.appeal_id ?? null,
      upload_post_user:
        dto.upload_post_user?.trim() ||
        this.uploadPostClient.getDefaultUser() ||
        null,
      platforms: platforms.length ? platforms : null,
      title,
      description,
      photo_urls: photoUrls.length ? photoUrls : null,
      facebook_page_id: dto.facebook_page_id?.trim() || null,
      target_linkedin_page_id: dto.target_linkedin_page_id?.trim() || null,
      first_comment: dto.first_comment?.trim() || null,
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      status: dto.status ?? UploadPostStatus.DRAFT,
    });

    const saved = await this.uploadPostRepo.save(row);

    if (dto.publish_to_upload_post) {
      return this.publish(saved.id);
    }
    return saved;
  }

  async update(id: number, dto: UpdateUploadPostDto): Promise<UploadPost> {
    const row = await this.findOne(id);
    if (
      row.status === UploadPostStatus.PUBLISHED &&
      dto.publish_to_upload_post !== true
    ) {
      throw new BadRequestException(
        "Published posts cannot be edited. Create a new post instead.",
      );
    }

    if (dto.campaign_id !== undefined) row.campaign_id = dto.campaign_id ?? null;
    if (dto.appeal_id !== undefined) row.appeal_id = dto.appeal_id ?? null;
    if (dto.upload_post_user !== undefined) {
      row.upload_post_user = dto.upload_post_user?.trim() || null;
    }
    if (dto.platforms !== undefined) {
      const platforms = this.normalizePlatforms(dto.platforms);
      row.platforms = platforms.length ? platforms : null;
    }
    if (dto.title !== undefined) row.title = dto.title?.trim() || null;
    if (dto.description !== undefined) {
      row.description = dto.description?.trim() || null;
    }
    if (dto.photo_urls !== undefined || dto.image_url !== undefined) {
      const photoUrls = this.normalizePhotoUrls({
        photo_urls: dto.photo_urls ?? row.photo_urls ?? undefined,
        image_url: dto.image_url,
      });
      row.photo_urls = photoUrls.length ? photoUrls : null;
    }
    if (dto.facebook_page_id !== undefined) {
      row.facebook_page_id = dto.facebook_page_id?.trim() || null;
    }
    if (dto.target_linkedin_page_id !== undefined) {
      row.target_linkedin_page_id =
        dto.target_linkedin_page_id?.trim() || null;
    }
    if (dto.first_comment !== undefined) {
      row.first_comment = dto.first_comment?.trim() || null;
    }
    if (dto.scheduled_at !== undefined) {
      row.scheduled_at = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
    }
    if (dto.status !== undefined) row.status = dto.status;

    const saved = await this.uploadPostRepo.save(row);
    if (dto.publish_to_upload_post) {
      return this.publish(saved.id);
    }
    return saved;
  }

  async remove(id: number): Promise<void> {
    const row = await this.findOne(id);
    row.is_archived = true;
    row.status = UploadPostStatus.CANCELLED;
    await this.uploadPostRepo.save(row);
  }

  listProfiles() {
    return this.uploadPostClient.listProfiles();
  }

  listFacebookPages(user?: string) {
    return this.uploadPostClient.listFacebookPages(user);
  }

  async publish(id: number): Promise<UploadPost> {
    const row = await this.findOne(id);

    const user =
      row.upload_post_user?.trim() ||
      this.uploadPostClient.getDefaultUser() ||
      null;
    if (!user) {
      throw new BadRequestException(
        "Upload-Post profile user is required. Set upload_post_user or UPLOAD_POST_USER.",
      );
    }
    if (!row.platforms?.length) {
      throw new BadRequestException("At least one platform is required");
    }
    if (!row.photo_urls?.length) {
      throw new BadRequestException(
        "At least one photo URL is required to publish",
      );
    }
    if (row.platforms.includes("facebook") && !row.facebook_page_id?.trim()) {
      throw new BadRequestException(
        "facebook_page_id is required when publishing to Facebook",
      );
    }

    try {
      const result = await this.uploadPostClient.uploadPhotos({
        user,
        platforms: row.platforms,
        photoUrls: row.photo_urls,
        title: row.title,
        description: row.description,
        scheduledDate: row.scheduled_at
          ? row.scheduled_at.toISOString()
          : null,
        firstComment: row.first_comment,
        facebookPageId: row.facebook_page_id,
        targetLinkedinPageId: row.target_linkedin_page_id,
        externalId: `upload_post_${row.id}`,
        asyncUpload: false,
      });

      row.upload_post_user = user;
      row.upload_post_id =
        (result.post_id as string) || row.upload_post_id || null;
      row.request_id =
        (result.request_id as string) || row.request_id || null;
      row.job_id = (result.job_id as string) || row.job_id || null;
      row.last_response = result as Record<string, unknown>;
      row.last_error = null;
      row.status = row.scheduled_at
        ? UploadPostStatus.SCHEDULED
        : UploadPostStatus.PUBLISHED;

      return this.uploadPostRepo.save(row);
    } catch (err: any) {
      row.status = UploadPostStatus.FAILED;
      row.last_error = err?.message || String(err);
      await this.uploadPostRepo.save(row);
      throw err;
    }
  }

  async syncStatus(id: number): Promise<{
    updated: boolean;
    oldStatus: UploadPostStatus;
    newStatus: UploadPostStatus;
    remote: Record<string, unknown>;
    post: UploadPost;
    message: string;
  }> {
    const row = await this.findOne(id);
    if (row.status === UploadPostStatus.CANCELLED) {
      throw new BadRequestException("Cancelled posts cannot be synced");
    }
    if (!row.request_id?.trim() && !row.job_id?.trim()) {
      throw new BadRequestException(
        "Post has no request_id/job_id to sync from Upload-Post",
      );
    }

    const oldStatus = row.status;
    const remote = await this.uploadPostClient.getUploadStatus(
      (row.request_id || row.job_id) as string,
    );

    const remoteStatus = String(
      remote.status || (remote as any).state || "",
    ).toLowerCase();
    let newStatus = oldStatus;

    if (
      ["completed", "published", "sent", "success", "done"].includes(
        remoteStatus,
      )
    ) {
      newStatus = UploadPostStatus.PUBLISHED;
    } else if (
      ["failed", "error"].includes(remoteStatus) ||
      remote.success === false
    ) {
      newStatus = UploadPostStatus.FAILED;
      row.last_error =
        (remote as any).error ||
        (remote as any).message ||
        row.last_error ||
        "Upload-Post reported failure";
    } else if (
      ["scheduled", "pending", "processing", "queued", "running"].includes(
        remoteStatus,
      )
    ) {
      newStatus = UploadPostStatus.SCHEDULED;
    }

    const updated = newStatus !== oldStatus;
    row.last_response = remote as Record<string, unknown>;
    if (updated) {
      row.status = newStatus;
      if (newStatus === UploadPostStatus.PUBLISHED) {
        row.last_error = null;
      }
    }
    await this.uploadPostRepo.save(row);

    const message = updated
      ? `Status updated from ${oldStatus} to ${newStatus}`
      : `Status is up to date (${remoteStatus || "unknown"})`;

    return {
      updated,
      oldStatus,
      newStatus: row.status,
      remote: remote as Record<string, unknown>,
      post: row,
      message,
    };
  }
}
