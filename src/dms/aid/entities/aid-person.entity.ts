import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import {
  AidEducationLevel,
  AidLiteracyCategory,
  AidLiteracyStatus,
  AidMaritalStatus,
  AidPersonGender,
  AidBispStatus,
  AidNectaStatus,
  AidPropertyType,
  AidResidentType,
} from "../aid.enums";

@Entity("aid_people")
/** CNIC unique only among active (non-archived) rows — archived CNICs can be reused. */
@Index("uq_aid_people_cnic_active", ["cnic"], {
  unique: true,
  where: '"is_archived" = false AND "cnic" IS NOT NULL',
})
export class AidPerson extends BaseEntity {
  @Column({ type: "varchar", length: 200 })
  full_name: string;

  /** Father / husband name (Urdu or English) — Family Head personal card. */
  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  father_or_husband_name: string | null;

  /** Unique among non-archived people (see uq_aid_people_cnic_active). */
  @Column({ type: "varchar", length: 15, nullable: true, default: null })
  cnic: string | null;

  @Column({ type: "date", nullable: true, default: null })
  cnic_expiry: string | null;

  /** Full name in Urdu script (optional). */
  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  name_urdu: string | null;

  /** Caste / tribe (optional) — Family Head identity. */
  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  caste: string | null;

  @Column({ type: "varchar", length: 30, nullable: true, default: null })
  phone: string | null;

  /** Alternate contact with optional relation note, e.g. "0301-… (son)". */
  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  phone_alternate: string | null;

  @Column({ type: "varchar", length: 500, nullable: true, default: null })
  photo_url: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  photo_name: string | null;

  @Column({
    type: "enum",
    enum: AidPersonGender,
    nullable: true,
    default: null,
  })
  gender: AidPersonGender | null;

  @Column({ type: "date", nullable: true, default: null })
  date_of_birth: string | null;

  @Column({
    type: "enum",
    enum: AidMaritalStatus,
    nullable: true,
    default: null,
  })
  marital_status: AidMaritalStatus | null;

  /** Vulnerability category(ies) — single or comma-separated multi-select. */
  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  vulnerability: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  occupation: string | null;

  /** Dependency within household (e.g. dependent_on_family_head). */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  household_dependency: string | null;

  @Column({
    type: "enum",
    enum: AidEducationLevel,
    nullable: true,
    default: null,
  })
  education_level: AidEducationLevel | null;

  /** Literacy tree root: educated | uneducated. */
  @Column({
    type: "enum",
    enum: AidLiteracyStatus,
    nullable: true,
    default: null,
  })
  literacy_status: AidLiteracyStatus | null;

  /** Literacy tree leaf category (student, job, laborer, …). */
  @Column({
    type: "enum",
    enum: AidLiteracyCategory,
    nullable: true,
    default: null,
  })
  literacy_category: AidLiteracyCategory | null;

  /** Student path: class / type of class / editable class name. */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  student_class: string | null;

  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  student_class_type: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  student_class_name: string | null;

  /** Approximate monthly household/personal income (PKR), optional. */
  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true, default: null })
  monthly_income: string | null;

  @Column({ type: "boolean", default: false })
  has_disability: boolean;

  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  disability_type: string | null;

  /** Do you have land? */
  @Column({ type: "boolean", default: false })
  has_land: boolean;

  /** Agri / commercial property type when has_land. */
  @Column({
    type: "enum",
    enum: AidPropertyType,
    nullable: true,
    default: null,
  })
  property_type: AidPropertyType | null;

  @Column({ type: "text", nullable: true, default: null })
  property_details: string | null;

  /** Area of primary/legacy property (also stored per row in property_entries). */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  property_area: string | null;

  /** Rows: property_type, property_area, property_details */
  @Column({ type: "jsonb", nullable: true, default: null })
  property_entries: Record<string, unknown>[] | null;

  /** Resident — Own House | Rented | Sham Lot */
  @Column({
    type: "enum",
    enum: AidResidentType,
    nullable: true,
    default: null,
  })
  resident_type: AidResidentType | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  resident_ownership_status: string | null;

  @Column({ type: "varchar", length: 200, nullable: true, default: null })
  resident_ownership_other: string | null;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true, default: null })
  rented_amount: string | null;

  @Column({ type: "numeric", precision: 10, scale: 2, nullable: true, default: null })
  house_area_marla: string | null;

  @Column({ type: "text", nullable: true, default: null })
  house_details: string | null;

  /** Rows: resident_type, ownership, area, details, rented_amount */
  @Column({ type: "jsonb", nullable: true, default: null })
  resident_entries: Record<string, unknown>[] | null;

  @Column({ type: "boolean", default: false })
  has_livestock: boolean;

  /** Rows: animal_type, quantity, ownership, owner_name, owner_contact */
  @Column({ type: "jsonb", nullable: true, default: null })
  livestock_entries: Record<string, unknown>[] | null;

  @Column({ type: "boolean", default: false })
  has_vehicle: boolean;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  vehicle_type: string | null;

  /** Rows: vehicle_type */
  @Column({ type: "jsonb", nullable: true, default: null })
  vehicle_entries: Record<string, unknown>[] | null;

  @Column({
    type: "enum",
    enum: AidNectaStatus,
    nullable: true,
    default: null,
  })
  necta_status: AidNectaStatus | null;

  @Column({ type: "varchar", length: 500, nullable: true, default: null })
  necta_document_url: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  necta_document_name: string | null;

  @Column({
    type: "enum",
    enum: AidBispStatus,
    nullable: true,
    default: null,
  })
  bisp_status: AidBispStatus | null;

  @Column({ type: "boolean", default: true })
  is_alive: boolean;

  @Column({ type: "text", nullable: true, default: null })
  health_notes: string | null;

  @Column({ type: "text", nullable: true, default: null })
  address: string | null;

  /** Where the person lives now (may differ from CNIC address). */
  @Column({ type: "text", nullable: true, default: null })
  current_address: string | null;

  /**
   * SecuGen (or uploaded) thumb impression capture object.
   * Reused on Zakat / Consent forms wherever this person is the form subject.
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  thumb_impression: Record<string, unknown> | null;

  /**
   * ePad (or uploaded) signature capture object.
   * Reused on Zakat / Consent forms wherever this person is the form subject.
   */
  @Column({ type: "jsonb", nullable: true, default: null })
  signature: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 100, nullable: true, default: null })
  city: string | null;

  @Column({ type: "varchar", length: 100, nullable: true, default: null })
  province: string | null;

  @Column({ type: "varchar", length: 100, nullable: true, default: null })
  district: string | null;

  @Column({ type: "varchar", length: 100, nullable: true, default: null })
  tehsil: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  union_council: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  landmark: string | null;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  is_active: boolean;
}
