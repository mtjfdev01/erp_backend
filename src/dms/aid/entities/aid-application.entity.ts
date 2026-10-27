import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { User } from "../../../users/user.entity";
import {
  AidApplicationStatus,
  AidCaseSource,
  AidCeoApprovalStatus,
  AidDeliveryStatus,
  AidRequestType,
  AidWriterRelation,
} from "../aid.enums";
import { AidHousehold } from "./aid-household.entity";
import { AidPerson } from "./aid-person.entity";

@Entity("aid_applications")
@Index("idx_aid_app_status", ["status"])
@Index("idx_aid_app_beneficiary", ["beneficiary_person_id"])
@Index("idx_aid_app_assigned", ["assigned_to_user_id"])
export class AidApplication extends BaseEntity {
  @Column({ type: "varchar", length: 40, unique: true })
  application_no: string;

  @Column({ type: "int" })
  beneficiary_person_id: number;

  @ManyToOne(() => AidPerson, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "beneficiary_person_id" })
  beneficiary: AidPerson;

  @Column({ type: "int", nullable: true, default: null })
  household_id: number | null;

  @ManyToOne(() => AidHousehold, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "household_id" })
  household: AidHousehold | null;

  @Column({ type: "int" })
  writer_person_id: number;

  @ManyToOne(() => AidPerson, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "writer_person_id" })
  writer: AidPerson;

  @Column({
    type: "enum",
    enum: AidWriterRelation,
    default: AidWriterRelation.SELF,
  })
  writer_relation: AidWriterRelation;

  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  title: string | null;

  @Column({ type: "text", nullable: true, default: null })
  request_summary: string | null;

  /** Intake channel — walk-in, field survey, referral, call center. */
  @Column({
    type: "enum",
    enum: AidCaseSource,
    nullable: true,
    default: AidCaseSource.WALK_IN,
  })
  case_source: AidCaseSource | null;

  @Column({
    type: "enum",
    enum: AidRequestType,
    default: AidRequestType.OTHER,
  })
  requested_aid_type: AidRequestType;

  /**
   * Catalog program under requested_aid_type (e.g. health_patient_care).
   * Drives Expected Amount from the project rates sheet.
   */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  aid_program: string | null;

  /** Expected amount (PKR) for the selected program — lower bound when ranged. */
  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    nullable: true,
    default: null,
  })
  expected_amount: string | null;

  /** Upper bound when the program rate is a range (e.g. Hand Pump 70k–90k). */
  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    nullable: true,
    default: null,
  })
  expected_amount_max: string | null;

  /**
   * Education aid type only:
   * education_history[], scholarships[], income_source_before, continue_education_if_not_approved
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  education_details: Record<string, unknown> | null;

  /**
   * Ration aid type only:
   * persons (male/female/kids), wheat, how_know_mtjf, arrangements, duration, alternative plan
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  ration_details: Record<string, unknown> | null;

  /**
   * Marriage gift aid type only:
   * date_of_marriage, nikah status/date, bride-groom relation, earlier expenses, items
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  marriage_gift_details: Record<string, unknown> | null;

  /**
   * Financial assistance aid type only — Financial Condition intake
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  financial_assistance_details: Record<string, unknown> | null;

  /**
   * Clean Water / Water Program survey (EN/UR) — site, TDS, project specs, beneficiaries.
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  clean_water_details: Record<string, unknown> | null;

  /**
   * Zakat Permission Letter (اجازت نامہ برائے زکوٰۃ) — all aid types.
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  zakat_permission: Record<string, unknown> | null;

  /**
   * Media / donor Consent Form (کنسنٹ فارم) — all aid types.
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  consent_form: Record<string, unknown> | null;

  @Column({
    type: "enum",
    enum: AidApplicationStatus,
    default: AidApplicationStatus.DRAFT,
  })
  status: AidApplicationStatus;

  @Column({ type: "text", nullable: true, default: null })
  rejection_reason: string | null;

  @Column({ type: "text", nullable: true, default: null })
  verification_notes: string | null;

  /** Home-visit checklist answers (booleans by item key). No geo/photo in this phase. */
  @Column({ type: "jsonb", nullable: true, default: null })
  verification_checklist: Record<string, unknown> | null;

  /**
   * Investigator recommendation after field visit:
   * decision, amount, period_months, remarks, vulnerability snapshots.
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  investigation_recommendation: Record<string, unknown> | null;

  /** Required when approving/verifying despite cooldown or same-year prior success. */
  @Column({ type: "text", nullable: true, default: null })
  leakage_override_reason: string | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  leakage_override_at: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  leakage_override_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "leakage_override_by_id" })
  leakage_override_by: User | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  verified_at: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  verified_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "verified_by_id" })
  verified_by: User | null;

  @Column({
    type: "enum",
    enum: AidCeoApprovalStatus,
    default: AidCeoApprovalStatus.NOT_REQUIRED,
  })
  ceo_approval_status: AidCeoApprovalStatus;

  @Column({ type: "text", nullable: true, default: null })
  ceo_rejection_reason: string | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  ceo_decided_at: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  ceo_decided_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ceo_decided_by_id" })
  ceo_decided_by: User | null;

  @Column({
    type: "enum",
    enum: AidDeliveryStatus,
    default: AidDeliveryStatus.NOT_STARTED,
  })
  delivery_status: AidDeliveryStatus;

  @Column({ type: "text", nullable: true, default: null })
  delivery_notes: string | null;

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

  @Column({ type: "timestamptz", nullable: true, default: null })
  submitted_at: Date | null;
}
