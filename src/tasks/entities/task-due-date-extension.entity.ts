import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Task } from "./task.entity";
import { User } from "../../users/user.entity";

export enum TaskDueDateExtensionStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

@Entity("task_due_date_extensions")
export class TaskDueDateExtension {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  task_id: number;

  @ManyToOne(() => Task, (task) => task.due_date_extensions, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "task_id" })
  task: Task;

  @Column({ type: "int" })
  requested_by_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "requested_by_id" })
  requested_by: User;

  @Column({ type: "date" })
  current_due_date: Date;

  @Column({ type: "date" })
  proposed_due_date: Date;

  @Column({ type: "text" })
  reason: string;

  @Column({
    type: "varchar",
    length: 20,
    default: TaskDueDateExtensionStatus.PENDING,
  })
  status: TaskDueDateExtensionStatus;

  @Column({ type: "int", nullable: true })
  reviewed_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "reviewed_by_id" })
  reviewed_by: User | null;

  @Column({ type: "text", nullable: true })
  review_note: string | null;

  @Column({ type: "timestamp", nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at: Date;
}
