import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";
import { Complaint } from "./complaint.entity";
import { User } from "../../users/user.entity";

@Entity("complaint_time_entries")
export class ComplaintTimeEntry extends BaseEntity {
  @ManyToOne(() => Complaint, (complaint) => complaint.time_entries, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @ManyToOne(() => User, (user) => user.id, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "int", default: 0 })
  seconds: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "timestamp", nullable: true })
  started_at: Date;

  @Column({ type: "timestamp", nullable: true })
  stopped_at: Date;
}
