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

/**
 * Point of contact (POC) for a CSR donor (company).
 * Not a donor — the company in csr_donors is the donor.
 */
@Entity("csr_pocs")
@Index(["csr_donor_id"])
@Index(["legacy_donor_id"], { unique: true, where: '"legacy_donor_id" IS NOT NULL' })
export class CsrPoc extends BaseEntity {
  @Column({ type: "int" })
  csr_donor_id: number;

  @ManyToOne(() => Organization, (org) => org.pocs, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "csr_donor_id" })
  csr_donor: Organization;

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
