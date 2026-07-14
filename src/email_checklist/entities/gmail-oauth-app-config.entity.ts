import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

/** Single-row app-level Google OAuth config (one Google Cloud app for the whole ERP). */
@Entity("gmail_oauth_app_config")
export class GmailOAuthAppConfig {
  @PrimaryColumn({ type: "int", default: 1 })
  id: number;

  @Column({ name: "client_id", type: "varchar", length: 512 })
  client_id: string;

  @Column({ name: "client_secret", type: "text" })
  client_secret: string;

  @Column({ name: "redirect_uri", type: "varchar", length: 512, nullable: true })
  redirect_uri: string | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updated_at: Date;
}
