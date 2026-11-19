import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";

export enum UploadPostStatus {
  DRAFT = "draft",
  SCHEDULED = "scheduled",
  PUBLISHED = "published",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

/** Platforms supported by Upload-Post photo API in this module. */
export const UPLOAD_POST_PHOTO_PLATFORMS = [
  "tiktok",
  "instagram",
  "facebook",
  "linkedin",
  "threads",
] as const;

export type UploadPostPhotoPlatform =
  (typeof UPLOAD_POST_PHOTO_PLATFORMS)[number];

@Entity("upload_posts")
@Index("idx_upload_posts_status", ["status"])
@Index("idx_upload_posts_campaign", ["campaign_id"])
@Index("idx_upload_posts_appeal", ["appeal_id"])
export class UploadPost extends BaseEntity {
  @Column({ type: "int", nullable: true, default: null })
  campaign_id: number | null;

  @Column({ type: "int", nullable: true, default: null })
  appeal_id: number | null;

  /** Upload-Post profile username (`user` param). */
  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  upload_post_user: string | null;

  /** Selected platforms, e.g. ["instagram","facebook"]. */
  @Column({ type: "jsonb", nullable: true, default: null })
  platforms: string[] | null;

  @Column({ type: "text", nullable: true, default: null })
  title: string | null;

  @Column({ type: "text", nullable: true, default: null })
  description: string | null;

  /** Public HTTPS image URL(s) sent as photos[]. */
  @Column({ type: "jsonb", nullable: true, default: null })
  photo_urls: string[] | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  facebook_page_id: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  target_linkedin_page_id: string | null;

  @Column({ type: "text", nullable: true, default: null })
  first_comment: string | null;

  @Column({ type: "timestamp", nullable: true, default: null })
  scheduled_at: Date | null;

  @Column({
    type: "varchar",
    length: 50,
    default: UploadPostStatus.DRAFT,
  })
  status: UploadPostStatus;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  upload_post_id: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  request_id: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  job_id: string | null;

  @Column({ type: "jsonb", nullable: true, default: null })
  last_response: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true, default: null })
  last_error: string | null;
}
