import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { User } from "../../../users/user.entity";

export enum OperationalQueryStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

/**
 * Polymorphic operational change request.
 * subject_type + subject_id identify the record; action + payload describe the change.
 * previous_payload keeps the pre-change snapshot so data is never lost.
 */
@Entity("operational_queries")
@Index("idx_oq_subject", ["subject_type", "subject_id"])
@Index("idx_oq_status", ["status"])
@Index("idx_oq_approver", ["approver_id"])
@Index("idx_oq_requested_by", ["requested_by_id"])
export class OperationalQuery extends BaseEntity {
  @Column({ type: "varchar", length: 80 })
  subject_type: string;

  @Column({ type: "int" })
  subject_id: number;

  @Column({ type: "varchar", length: 80 })
  action: string;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text" })
  reason: string;

  /** Requested change fields (e.g. { status, removal_date }). */
  @Column({ type: "jsonb", default: {} })
  payload: Record<string, unknown>;

  /** Snapshot before change — preserved forever for audit / rollback visibility. */
  @Column({ type: "jsonb", default: {} })
  previous_payload: Record<string, unknown>;

  /** Display helpers (shop name, box no, etc.). */
  @Column({ type: "jsonb", nullable: true, default: null })
  subject_meta: Record<string, unknown> | null;

  @Column({ type: "int" })
  requested_by_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "requested_by_id" })
  requested_by: User;

  @Column({ type: "int" })
  approver_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "approver_id" })
  approver: User;

  @Column({
    type: "varchar",
    length: 20,
    default: OperationalQueryStatus.PENDING,
  })
  status: OperationalQueryStatus;

  @Column({ type: "text", nullable: true, default: null })
  review_note: string | null;

  @Column({ type: "int", nullable: true, default: null })
  decided_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "decided_by_id" })
  decided_by: User | null;

  @Column({ type: "timestamp", nullable: true, default: null })
  decided_at: Date | null;

  /** When the payload was successfully applied to the subject. */
  @Column({ type: "timestamp", nullable: true, default: null })
  applied_at: Date | null;
}
