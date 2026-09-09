import {
  Entity,
  Column,
  OneToMany,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User, Department } from "../../users/user.entity";
import { ComplaintAttachment } from "./complaint-attachment.entity";
import { ComplaintComment } from "./complaint-comment.entity";
import { ComplaintActivity } from "./complaint-activity.entity";
import { ComplaintTimeEntry } from "./complaint-time-entry.entity";

export enum ComplaintPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum ComplaintStatus {
  DRAFT = "draft",
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  BLOCKED = "blocked",
  PENDING_APPROVAL = "pending_approval",
  APPROVED = "approved",
  REJECTED = "rejected",
  COMPLETED = "completed",
  CLOSED = "closed",
  CANCELLED = "cancelled",
}

export enum ComplaintWorkflowType {
  STANDARD = "standard",
  APPROVAL_REQUIRED = "approval_required",
}

export enum ComplaintType {
  ONE_TIME = "one_time",
  RECURRING = "recurring",
  PROJECT_LINKED = "project_linked",
}

/** Ticket classification: Issue (e.g. system fix) vs Complaint. */
export enum ComplaintKind {
  ISSUE = "issue",
  COMPLAINT = "complaint",
}

/** Origin: Internal (staff) vs External (outside). */
export enum ComplaintScope {
  INTERNAL = "internal",
  EXTERNAL = "external",
}

export enum RecurrenceEndType {
  NEVER = "never",
  ON_DATE = "on_date",
  AFTER_OCCURRENCES = "after_occurrences",
}

@Entity("complaints")
export class Complaint {
  @PrimaryGeneratedColumn("increment")
  id: number;

  @Column({ type: "varchar" })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({
    type: "enum",
    enum: Department,
  })
  department: Department;

  @Column({
    type: "enum",
    enum: ComplaintPriority,
    default: ComplaintPriority.MEDIUM,
  })
  priority: ComplaintPriority;

  @Column({
    type: "enum",
    enum: ComplaintStatus,
    default: ComplaintStatus.OPEN,
  })
  status: ComplaintStatus;

  @Column({
    type: "enum",
    enum: ComplaintWorkflowType,
    default: ComplaintWorkflowType.STANDARD,
  })
  workflow_type: ComplaintWorkflowType;
  @Column({ type: "int", array: true, nullable: true })
  approval_required_user_ids: number[];

  @Column({
    type: "enum",
    enum: ComplaintType,
    default: ComplaintType.ONE_TIME,
  })
  complaint_type: ComplaintType;

  @Column({
    type: "enum",
    enum: ComplaintKind,
    default: ComplaintKind.ISSUE,
  })
  type: ComplaintKind;

  @Column({
    type: "enum",
    enum: ComplaintScope,
    default: ComplaintScope.INTERNAL,
  })
  scope: ComplaintScope;

  @Column({ type: "date", nullable: true })
  start_date: Date;

  @Column({ type: "date", nullable: true })
  due_date: Date;

  @Column({ type: "date", nullable: true })
  completed_date: Date;

  @Column({ type: "int", array: true, nullable: true })
  assigned_user_ids: number[];

  @Column({ type: "jsonb", nullable: true })
  assigned_users_meta: { user_id: number; department: Department }[];

  @Column({ type: "int", nullable: true, name: "reported_to" })
  reported_by_id: number;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: "SET NULL" })
  @JoinColumn({ name: "reported_to" })
  reported_by: User;

  @Column({ type: "int", nullable: true })
  created_by_id: number;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by_id" })
  created_by: User;

  @Column({ type: "int", nullable: true })
  updated_by_id: number;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: "SET NULL" })
  @JoinColumn({ name: "updated_by_id" })
  updated_by: User;

  @Column({ type: "int", array: true, nullable: true, name: "approved_by_id" })
  approved_by_id: number[];

  @Column({ type: "int", array: true, nullable: true, name: "rejected_by_id" })
  rejected_by_id: number[];

  @Column({ type: "varchar", nullable: true, default: null })
  project_id: string;

  @Column({ type: "varchar", nullable: true, default: null })
  project_name: string;

  @Column({ type: "varchar", nullable: true, default: null })
  recurrence_rule: string;

  @Column({ type: "date", nullable: true })
  recurrence_next_date: Date;

  @Column({
    type: "enum",
    enum: RecurrenceEndType,
    default: RecurrenceEndType.NEVER,
    nullable: true,
  })
  recurrence_end_type: RecurrenceEndType;

  @Column({ type: "date", nullable: true })
  recurrence_end_date: Date;

  @Column({ type: "int", nullable: true })
  recurrence_end_occurrences: number;

  @Column({ type: "int", default: 0 })
  recurrence_created_count: number;

  @Column({ type: "int", default: 0 })
  progress: number;

  @Column({ type: "boolean", default: false })
  overdue_email_sent: boolean;

  @Column({ type: "text", nullable: true })
  last_progress_notes: string;

  @Column({ type: "text", array: true, nullable: true })
  mov_items: string[];

  @Column({ type: "jsonb", nullable: true })
  mov_assignments: { mov_index: number; user_id: number | null }[];

  @OneToMany(() => ComplaintAttachment, (att) => att.complaint, { cascade: true })
  attachments: ComplaintAttachment[];

  @OneToMany(() => ComplaintComment, (c) => c.complaint, { cascade: true })
  comments: ComplaintComment[];

  @OneToMany(() => ComplaintActivity, (a) => a.complaint, { cascade: true })
  activities: ComplaintActivity[];

  @OneToMany(() => ComplaintTimeEntry, (e) => e.complaint, { cascade: true })
  time_entries: ComplaintTimeEntry[];

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  updated_at: Date;

   @Column({ type: "varchar", nullable: true })
  source: string; // e.g., "ceo_note"

  @Column({ type: "int", nullable: true })
  source_id: number; // The ID of the source entity
}
