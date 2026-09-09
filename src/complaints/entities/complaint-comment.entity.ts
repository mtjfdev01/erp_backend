import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";
import { Complaint } from "./complaint.entity";
import { User } from "../../users/user.entity";

@Entity("complaint_comments")
export class ComplaintComment extends BaseEntity {
  @ManyToOne(() => Complaint, (complaint) => complaint.comments, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "complaint_id" })
  complaint: Complaint;

  @Column({ type: "text" })
  content: string;

  @Column({ type: "int", array: true, nullable: true })
  mentioned_user_ids: number[] | null;

  @ManyToOne(() => User, (user) => user.id, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "author" })
  author: User;
}
