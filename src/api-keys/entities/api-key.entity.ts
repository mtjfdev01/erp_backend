import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";

/**
 * Integration API keys for server-to-server partners (Ask Clinic, etc.).
 * Separate from legacy `external_api_keys` (donation POST /external/v1).
 */
@Entity("api_keys")
export class ApiKey extends BaseEntity {
  /** Display name, e.g. "Ask Clinic / AAS" */
  @Column({ type: "varchar", length: 120 })
  name: string;

  /** Full secret (unique). Sent as x-api-key. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 128 })
  api_key: string;

  /** Short prefix for list UI (full key only returned on create). */
  @Column({ type: "varchar", length: 20, nullable: true })
  key_prefix: string | null;

  /**
   * Allowed scopes, e.g. ["ask_clinic", "ask_clinic.beneficiaries"].
   * Empty / null = no scoped endpoints (reject scoped guards).
   */
  @Column({ type: "jsonb", default: [] })
  scopes: string[];

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  last_used_at: Date | null;
}
