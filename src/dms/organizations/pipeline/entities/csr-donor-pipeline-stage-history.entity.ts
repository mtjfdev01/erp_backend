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

@Entity("csr_donor_pipeline_stage_history")
@Index("idx_csr_donor_pipeline_history_csr_donor_id", ["csr_donor_id"])
@Index("idx_csr_donor_pipeline_history_created_at", ["created_at"])
export class CsrDonorPipelineStageHistory {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "int" })
  csr_donor_id: number;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "csr_donor_id" })
  csr_donor: Organization;

  @Column({ type: "varchar", length: 32, nullable: true })
  from_stage: string | null;

  @Column({ type: "varchar", length: 32 })
  to_stage: string;

  @Column({ type: "text" })
  reason: string;

  @Column({ type: "varchar", length: 24, default: "advanced" })
  transition_type: string;

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true, default: null })
  amount: number | null;

  @Column({ type: "varchar", length: 8, nullable: true, default: null })
  currency: string | null;

  @Column({ type: "int", nullable: true })
  changed_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "changed_by_id" })
  changed_by: User | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created_at: Date;
}
