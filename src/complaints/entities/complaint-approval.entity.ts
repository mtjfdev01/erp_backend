import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Complaint, ComplaintStatus } from "./complaint.entity";

@Entity("complaint_approvals")
export class ComplaintApproval {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "int" })
  complaint_id: number;

  @OneToOne(() => Complaint, { onDelete: "CASCADE" })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({ type: "int", array: true, nullable: true })
  approval_required_user_ids: number[];

  @Column({ type: "jsonb", nullable: true })
  approvals_meta: {
    user_id: number;
    decision: "approved" | "rejected" | "pending";
    decided_at?: Date;
  }[];

  @Column({ type: "int", array: true, nullable: true, name: "approved_by_id" })
  approved_by_id: number[];

  @Column({ type: "int", array: true, nullable: true, name: "rejected_by_id" })
  rejected_by_id: number[];

  @Column({
    type: "enum",
    enum: ComplaintStatus,
    nullable: true,
  })
  approval_status: ComplaintStatus | null;

  @Column({ type: "jsonb", nullable: true })
  submission_note:
    | {
        user_id: number;
        note: string;
        created_at?: Date;
      }[]
    | null;

  @Column({ type: "jsonb", nullable: true })
  approved_note:
    | {
        user_id: number;
        note: string;
        decided_at?: Date;
      }[]
    | null;

  @Column({ type: "jsonb", nullable: true })
  rejected_note:
    | {
        user_id: number;
        note: string;
        decided_at?: Date;
      }[]
    | null;
}
