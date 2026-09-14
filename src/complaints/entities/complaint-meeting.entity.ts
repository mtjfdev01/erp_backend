import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Complaint } from "./complaint.entity";
import { User, Department } from "../../users/user.entity";

export enum ComplaintMeetingStatus {
  SCHEDULED = "scheduled",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

@Entity("complaint_meetings")
export class ComplaintMeeting {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "int" })
  complaint_id: number;

  @ManyToOne(() => Complaint, { onDelete: "CASCADE" })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({ type: "timestamp" })
  scheduled_at: Date;

  @Column({ type: "int", nullable: true, default: 60 })
  duration_minutes: number;

  @Column({ type: "varchar", nullable: true })
  location: string;

  @Column({ type: "text", nullable: true })
  agenda: string;

  @Column({ type: "text", nullable: true })
  discussion_notes: string;

  @Column({
    type: "enum",
    enum: ComplaintMeetingStatus,
    default: ComplaintMeetingStatus.SCHEDULED,
  })
  status: ComplaintMeetingStatus;

  @Column({ type: "int", array: true, nullable: true })
  attendee_user_ids: number[];

  @Column({
    type: "enum",
    enum: Department,
    array: true,
    nullable: true,
  })
  attendee_departments: Department[];

  @Column({ type: "int", nullable: true })
  created_by_id: number;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by_id" })
  created_by: User;

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  updated_at: Date;
}
