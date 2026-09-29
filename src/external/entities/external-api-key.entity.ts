import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";

/**
 * Partner API keys for POST /external/v1.
 * One row per third-party integration (add as many as needed).
 */
@Entity("external_api_keys")
export class ExternalApiKey extends BaseEntity {
  /** Display name, e.g. "Partner Portal", "EOceans" */
  @Column({ type: "varchar", length: 120 })
  partner_name: string;

  /** Full secret key (unique). Sent as X-Api-Key. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 128 })
  api_key: string;

  /** Short prefix for list UI (never expose full key again after create). */
  @Column({ type: "varchar", length: 16, nullable: true })
  key_prefix: string | null;

  /** Default donation_source when partner omits it in payload. */
  @Column({ type: "varchar", length: 120, nullable: true })
  donation_source: string | null;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  last_used_at: Date | null;
}
