import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { Column, Entity, JoinColumn, ManyToOne, Index } from "typeorm";
import { Donation } from "../../entities/donation.entity";
import { User } from "src/users/user.entity";
import {
  DonationAllotmentSource,
  DonationAllotmentStatus,
} from "../donation-allotment-status.enum";

@Entity("donation_allotments")
@Index(["donation_id", "status"])
@Index(["approver_user_id", "status"])
export class DonationAllotment extends BaseEntity {
  @Column({ type: "int" })
  donation_id: number;

  @ManyToOne(() => Donation, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "donation_id" })
  donation: Donation;

  @Column({ type: "int" })
  requested_by_user_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "requested_by_user_id" })
  requested_by: User;

  @Column({ type: "int" })
  credited_to_user_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "credited_to_user_id" })
  credited_to: User;

  /** Reporting manager of the requester; null escalates to fund_raising_manager. */
  @Column({ type: "int", nullable: true, default: null })
  approver_user_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "approver_user_id" })
  approver: User | null;

  @Column({
    type: "varchar",
    length: 32,
    default: DonationAllotmentStatus.PENDING,
  })
  status: DonationAllotmentStatus | string;

  @Column({
    type: "varchar",
    length: 64,
    default: DonationAllotmentSource.STAFF_CLAIM,
  })
  source: DonationAllotmentSource | string;

  @Column({ type: "text", nullable: true, default: null })
  request_note: string | null;

  @Column({ type: "text", nullable: true, default: null })
  decision_note: string | null;

  @Column({ type: "int", nullable: true, default: null })
  decided_by_user_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "decided_by_user_id" })
  decided_by: User | null;

  @Column({ type: "timestamp", nullable: true, default: null })
  decided_at: Date | null;
}
