import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { User } from "src/users/user.entity";

/** primary = day-to-day boss; secondary = matrix / dotted-line */
export type ReportingRelationship = "primary" | "secondary";

/**
 * Standalone reporting edge store.
 * Does NOT replace users.manager_id / user_managers — those keep powering
 * existing DataScope / team filters until a later migration.
 */
@Entity("reporting_edges")
@Index(["user_id", "manager_id", "relationship"], { unique: false })
@Index(["user_id", "relationship"])
@Index(["manager_id"])
export class ReportingEdge extends BaseEntity {
  /** Employee (the report) */
  @Column({ type: "int" })
  user_id: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  /** Manager they report to */
  @Column({ type: "int" })
  manager_id: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "manager_id" })
  manager: User;

  @Column({ type: "varchar", length: 20, default: "primary" })
  relationship: ReportingRelationship;

  /** Optional department context (usually employee's department) */
  @Column({ type: "varchar", length: 64, nullable: true, default: null })
  department: string | null;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;
}
