import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";
import {
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
  ComplaintWorkflowType,
  ComplaintType,
} from "./complaint.entity";
import { User, Department } from "../../users/user.entity";

@Entity("complaint_activities")
export class ComplaintActivity extends BaseEntity {
  @ManyToOne(() => Complaint, (complaint) => complaint.activities, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({ type: "varchar" })
  action: string;

  @Column({ type: "varchar", nullable: true })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "varchar", nullable: true })
  priority: ComplaintPriority;

  @Column({ type: "varchar", nullable: true })
  status: ComplaintStatus;

  @Column({ type: "varchar", nullable: true })
  workflow_type: ComplaintWorkflowType;

  @Column({ type: "varchar", nullable: true })
  complaint_type: ComplaintType;

  @Column({ type: "date", nullable: true })
  start_date: Date;

  @Column({ type: "date", nullable: true })
  due_date: Date;

  @Column({ type: "varchar", nullable: true })
  project_name: string;

  @Column({ type: "varchar", nullable: true })
  recurrence_rule: string;

  @Column({ type: "date", nullable: true })
  recurrence_next_date: Date;

  @Column({ type: "int", array: true, nullable: true })
  assigned_user_ids: number[];

  @Column({ type: "jsonb", nullable: true })
  assigned_users_meta: { user_id: number; department: Department }[];

  @Column({ type: "jsonb", nullable: true, default: {} })
  details: any;

  @ManyToOne(() => User, (user) => user.id, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "performed_by" })
  performed_by: User;
}
