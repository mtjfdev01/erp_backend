import { Entity, Column, ManyToOne, JoinColumn, Unique } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";
import { Complaint } from "./complaint.entity";
import { User } from "../../users/user.entity";

@Entity("complaint_due_reminders")
@Unique("uq_complaint_due_reminder_slot", [
  "complaint_id",
  "user_id",
  "remind_on_date",
  "remind_at_hour",
])
export class ComplaintDueReminder extends BaseEntity {
  @Column({ type: "int" })
  complaint_id: number;

  @ManyToOne(() => Complaint, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({ type: "int" })
  user_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "int" })
  offset_days: number;

  @Column({ type: "date" })
  remind_on_date: string;

  @Column({ type: "int" })
  remind_at_hour: number;
}
