import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { User } from "../../../users/user.entity";
import {
  AidDisbursementMode,
  AidDisbursementRecipientType,
  AidDisbursementStatus,
} from "../aid.enums";
import { AidApplication } from "./aid-application.entity";
import { AidPerson } from "./aid-person.entity";

@Entity("aid_disbursements")
@Index("idx_aid_disb_app", ["application_id"])
@Index("idx_aid_disb_status", ["status"])
@Index("idx_aid_disb_due", ["due_at"])
@Index("UQ_aid_disb_app_installment", ["application_id", "installment_no"], {
  unique: true,
})
export class AidDisbursement extends BaseEntity {
  @Column({ type: "int" })
  application_id: number;

  @ManyToOne(() => AidApplication, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "application_id" })
  application: AidApplication;

  @Column({ type: "int", nullable: true, default: null })
  beneficiary_person_id: number | null;

  @ManyToOne(() => AidPerson, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "beneficiary_person_id" })
  beneficiary: AidPerson | null;

  /** 1-based installment index within the application plan. */
  @Column({ type: "int", default: 1 })
  installment_no: number;

  /** Total installments planned for this application (denormalized). */
  @Column({ type: "int", default: 1 })
  total_installments: number;

  /** Planned unit quantity for this installment (e.g. packs). */
  @Column({ type: "numeric", precision: 12, scale: 2, default: 1 })
  planned_quantity: string;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true, default: null })
  delivered_quantity: string | null;

  @Column({ type: "numeric", precision: 14, scale: 2, nullable: true, default: null })
  planned_amount: string | null;

  @Column({ type: "numeric", precision: 14, scale: 2, nullable: true, default: null })
  delivered_amount: string | null;

  @Column({ type: "date", nullable: true, default: null })
  due_at: string | null;

  @Column({
    type: "enum",
    enum: AidDisbursementStatus,
    default: AidDisbursementStatus.QUEUED,
  })
  status: AidDisbursementStatus;

  @Column({
    type: "enum",
    enum: AidDisbursementMode,
    nullable: true,
    default: null,
  })
  mode: AidDisbursementMode | null;

  /** Store issue / voucher / MR number. */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  reference_no: string | null;

  @Column({ type: "date", nullable: true, default: null })
  delivery_date: string | null;

  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  delivery_location: string | null;

  @Column({
    type: "enum",
    enum: AidDisbursementRecipientType,
    nullable: true,
    default: null,
  })
  recipient_type: AidDisbursementRecipientType | null;

  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  recipient_name: string | null;

  @Column({ type: "varchar", length: 20, nullable: true, default: null })
  recipient_cnic: string | null;

  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  recipient_relation: string | null;

  @Column({ type: "boolean", default: false })
  otp_verified: boolean;

  @Column({ type: "varchar", length: 30, nullable: true, default: null })
  otp_phone: string | null;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;

  /** Snapshot: zakat / donation / other. */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  fund_source: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  office_name: string | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  delivered_at: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  delivered_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "delivered_by_id" })
  delivered_by: User | null;

  @Column({ type: "int", nullable: true, default: null })
  assigned_to_user_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "assigned_to_user_id" })
  assigned_to: User | null;
}
