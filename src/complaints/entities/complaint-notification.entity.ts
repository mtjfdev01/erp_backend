import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";
import { User } from "../../users/user.entity";
import { Complaint } from "./complaint.entity";

export enum ComplaintNotificationType {
  ASSIGNED = "assigned",
  OVERDUE = "overdue",
  COMPLETED = "completed",
  APPROVED = "approved",
  REJECTED = "rejected",
}

@Entity("complaint_notifications")
export class ComplaintNotification extends BaseEntity {
  // _id is mapped to id in BaseEntity
  get _id(): number {
    return this.id;
  }

  @Column({ name: "user_id" })
  userId: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "complaint_id" })
  complaintId: number;

  @ManyToOne(() => Complaint, { onDelete: "CASCADE" })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({
    type: "enum",
    enum: ComplaintNotificationType,
  })
  type: ComplaintNotificationType;

  @Column({ name: "is_read", default: false })
  isRead: boolean;

  @Column({
    name: "sent_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  sentAt: Date;
}
