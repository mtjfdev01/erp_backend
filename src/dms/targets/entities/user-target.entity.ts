import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { User } from "../../../users/user.entity";

export enum UserTargetType {
  DONATION_AMOUNT = "donation_amount",
  DONATION_BOX_COLLECTION = "donation_box_collection",
}

export enum UserTargetPeriodType {
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  SIX_MONTHS = "six_months",
  YEARLY = "yearly",
}

@Entity("user_targets")
@Index("idx_user_targets_user", ["user_id"])
@Index("idx_user_targets_period", ["period_year", "period_month"])
@Index("idx_user_targets_lookup", [
  "user_id",
  "target_type",
  "period_year",
  "period_month",
])
export class UserTarget extends BaseEntity {
  @Column({ type: "int" })
  user_id: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  /** donation_amount | donation_box_collection */
  @Column({ type: "varchar", length: 60 })
  target_type: UserTargetType;

  @Column({ type: "numeric", precision: 14, scale: 2, default: 0 })
  target_amount: string;

  @Column({ type: "int" })
  period_year: number;

  /** 1–12 */
  @Column({ type: "int" })
  period_month: number;

  @Column({
    type: "varchar",
    length: 30,
    default: UserTargetPeriodType.MONTHLY,
  })
  period_type: UserTargetPeriodType;

  @Column({ type: "date", nullable: true, default: null })
  period_start: Date | string | null;

  @Column({ type: "date", nullable: true, default: null })
  period_end: Date | string | null;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;
}
