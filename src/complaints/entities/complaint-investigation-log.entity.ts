import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Complaint } from "./complaint.entity";
import { User } from "../../users/user.entity";

export enum ComplaintInvestigationAction {
  STATUS_CHANGE = "status_change",
  REMARK = "remark",
  NOMINEE_UPDATE = "nominee_update",
  NARRATIVE_UPDATE = "narrative_update",
  MEETING_SCHEDULED = "meeting_scheduled",
  MEETING_COMPLETED = "meeting_completed",
  INVESTIGATOR_ASSIGNED = "investigator_assigned",
  RESOLUTION = "resolution",
}

@Entity("complaint_investigation_logs")
export class ComplaintInvestigationLog {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "int" })
  complaint_id: number;

  @ManyToOne(() => Complaint, { onDelete: "CASCADE" })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({
    type: "enum",
    enum: ComplaintInvestigationAction,
    default: ComplaintInvestigationAction.REMARK,
  })
  action: ComplaintInvestigationAction;

  @Column({ type: "text", nullable: true })
  remarks: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown>;

  @Column({ type: "int", nullable: true })
  performed_by_id: number;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "performed_by_id" })
  performed_by: User;

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  created_at: Date;
}
