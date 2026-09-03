import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Organization } from "../../entities/organization.entity";
import { User } from "../../../../users/user.entity";
import { DonorAuditChange } from "../../../donor/audit/donor-audit.types";

@Entity("csr_donor_audit_logs")
@Index("idx_csr_donor_audit_logs_csr_donor_id", ["csr_donor_id"])
@Index("idx_csr_donor_audit_logs_created_at", ["created_at"])
export class CsrDonorAuditLog {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "int", nullable: true })
  csr_donor_id: number | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "csr_donor_id" })
  csr_donor: Organization | null;

  @Column({ type: "varchar", length: 40 })
  action: string;

  @Column({ type: "varchar", length: 40 })
  source: string;

  @Column({ type: "jsonb", default: [] })
  changes: DonorAuditChange[];

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
