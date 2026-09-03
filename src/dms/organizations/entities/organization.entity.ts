import {
  Entity,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { User } from "../../../users/user.entity";
import { OrganizationBranch } from "./organization-branch.entity";
import { DonorOrganizationAffiliation } from "./donor-organization-affiliation.entity";
import { CsrPoc } from "./csr-poc.entity";

/**
 * CSR donor master record (corporate / group company or legal entity).
 * Table: csr_donors. POC contacts live in csr_pocs.
 */
@Entity("csr_donors")
export class Organization extends BaseEntity {
  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  registration_number: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  email: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, default: null })
  phone: string | null;

  @Column({ type: "text", nullable: true, default: null })
  address: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  city: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  country: string | null;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  /** CRM pipeline stage. NULL = legacy CSR donors treated as donor. */
  @Column({ type: "varchar", length: 32, nullable: true, default: null })
  pipeline_stage: string | null;

  @Column({ type: "timestamptz", nullable: true, default: null })
  pipeline_stage_changed_at: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  pipeline_stage_changed_by_id: number | null;

  @ManyToOne(() => User, {
    nullable: true,
    eager: false,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "pipeline_stage_changed_by_id" })
  pipeline_stage_changed_by: User | null;

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true, default: null })
  pipeline_ask_amount: number | null;

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true, default: null })
  pipeline_pledge_amount: number | null;

  @Column({ type: "varchar", length: 8, nullable: true, default: "PKR" })
  pipeline_amount_currency: string | null;

  /** Optional parent group (conglomerate). Null = top-level org. */
  @Column({ type: "int", nullable: true, default: null })
  parent_organization_id: number | null;

  @ManyToOne(() => Organization, (org) => org.subsidiaries, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "parent_organization_id" })
  parent_organization: Organization | null;

  @OneToMany(() => Organization, (org) => org.parent_organization)
  subsidiaries: Organization[];

  @OneToMany(() => OrganizationBranch, (branch) => branch.organization)
  branches: OrganizationBranch[];

  @OneToMany(
    () => DonorOrganizationAffiliation,
    (affiliation) => affiliation.organization,
  )
  affiliations: DonorOrganizationAffiliation[];

  @OneToMany(() => CsrPoc, (poc) => poc.csr_donor)
  pocs: CsrPoc[];
}
