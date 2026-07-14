import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../users/user.entity";

@Entity("email_checklist_items")
@Index(["user_id", "gmail_message_id"], { unique: true })
export class EmailChecklistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "user_id", type: "int" })
  user_id: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "gmail_message_id", type: "varchar", length: 255 })
  gmail_message_id: string;

  @Column({ type: "text" })
  subject: string;

  @Column({ name: "email_from", type: "varchar", length: 512, default: "" })
  email_from: string;

  @Column({ name: "received_at", type: "timestamp", nullable: true })
  received_at: Date | null;

  @Column({ name: "is_done", type: "boolean", default: false })
  is_done: boolean;

  @Column({ name: "done_at", type: "timestamp", nullable: true })
  done_at: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  created_at: Date;
}
