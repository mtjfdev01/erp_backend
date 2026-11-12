import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { Organization } from "./organization.entity";
import { OrganizationBranch } from "./organization-branch.entity";
import { Donor } from "../../donor/entities/donor.entity";
import { OrganizationAffiliationRole } from "./donor-organization-affiliation.entity";
import { DEFAULT_POC_TYPE } from "../constants/poc-types.constants";
import { DonationBox } from "../../donation_box/entities/donation-box.entity";

/**
 * Point of contact (POC) for Corporate donors, Donation Boxes, or Mosques.
 */
@Entity("csr_pocs")
@Index(["csr_donor_id"])
@Index(["donation_box_id"])
@Index(["type"])
@Index(["legacy_donor_id"], { unique: true, where: '"legacy_donor_id" IS NOT NULL' })
export class CsrPoc extends BaseEntity {
  @Column({
    type: "varchar",
    length: 100,
    default: DEFAULT_POC_TYPE,
    nullable: true,
  })
  type: string;

  @Column({ type: "int", nullable: true, default: null })
  csr_donor_id: number | null;

  @ManyToOne(() => Organization, (org) => org.pocs, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "csr_donor_id" })
  csr_donor: Organization | null;

  @Column({ type: "int", nullable: true, default: null })
  donation_box_id: number | null;

  @ManyToOne(() => DonationBox, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "donation_box_id" })
  donation_box: DonationBox | null;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  email: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, default: null })
  phone: string | null;

  @Column({ type: "varchar", length: 30, nullable: true, default: null })
  cnic: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  business_type: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  business_type_other: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  area_of_interest: string | null;

  @Column({ type: "int", nullable: true, default: null })
  branch_id: number | null;

  @ManyToOne(() => OrganizationBranch, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "branch_id" })
  branch: OrganizationBranch | null;

  @Column({
    type: "varchar",
    length: 40,
    default: OrganizationAffiliationRole.CONTACT,
  })
  role: string;

  @Column({ type: "boolean", default: false })
  is_primary: boolean;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;

  /** Original donors.id when migrated from donor_type=csr (optional). */
  @Column({ type: "int", nullable: true, default: null })
  legacy_donor_id: number | null;

  @ManyToOne(() => Donor, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "legacy_donor_id" })
  legacy_donor: Donor | null;

  @Column({ type: "boolean", default: true })
  is_active: boolean;
}
