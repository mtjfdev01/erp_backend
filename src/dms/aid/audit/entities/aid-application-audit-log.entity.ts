import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../../../users/user.entity";
import { AidApplication } from "../../entities/aid-application.entity";
import { AidAuditChange } from "../aid-audit.types";

@Entity("aid_application_audit_logs")
@Index("idx_aid_app_audit_logs_application_id", ["application_id"])
@Index("idx_aid_app_audit_logs_created_at", ["created_at"])
@Index("idx_aid_app_audit_logs_action", ["action"])
export class AidApplicationAuditLog {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "int", nullable: true })
  application_id: number | null;

  @ManyToOne(() => AidApplication, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "application_id" })
  application: AidApplication | null;

  /** Stable application number snapshot (survives archive). */
  @Column({ type: "varchar", length: 64, nullable: true })
  application_no: string | null;

  @Column({ type: "varchar", length: 60 })
  action: string;

  @Column({ type: "varchar", length: 40, default: "staff_ui" })
  source: string;

  @Column({ type: "jsonb", default: [] })
  changes: AidAuditChange[];

  @Column({ type: "int", nullable: true })
  performed_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "performed_by_id" })
  performed_by: User | null;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created_at: Date;
}
