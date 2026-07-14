import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../users/user.entity";

@Entity("gmail_connections")
@Index(["user_id"], { unique: true })
export class GmailConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "user_id", type: "int" })
  user_id: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "gmail_email", type: "varchar", length: 255 })
  gmail_email: string;

  @Column({ name: "access_token", type: "text" })
  access_token: string;

  @Column({ name: "refresh_token", type: "text" })
  refresh_token: string;

  @Column({ name: "token_expiry", type: "timestamp", nullable: true })
  token_expiry: Date | null;

  @Column({ name: "last_synced_at", type: "timestamp", nullable: true })
  last_synced_at: Date | null;

  /** Only unread emails received after this time are imported (no backlog). */
  @Column({ name: "inbox_sync_from", type: "timestamp", nullable: true })
  inbox_sync_from: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  created_at: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updated_at: Date;
}
