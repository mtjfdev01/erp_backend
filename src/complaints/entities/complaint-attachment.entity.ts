import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";
import { Complaint } from "./complaint.entity";
import { User } from "../../users/user.entity";

@Entity("complaint_attachments")
export class ComplaintAttachment extends BaseEntity {
  @ManyToOne(() => Complaint, (complaint) => complaint.attachments, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({ type: "varchar" })
  file_name: string;

  @Column({ type: "varchar" })
  file_url: string;

  @Column({ type: "varchar", nullable: true })
  file_type: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "boolean", default: false })
  is_initial: boolean;

  @ManyToOne(() => User, (user) => user.id, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "uploaded_by" })
  uploaded_by: User;
}
