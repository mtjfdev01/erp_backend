import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { Donor } from "../../donor/entities/donor.entity";
import { Organization } from "../../organizations/entities/organization.entity";
import { CsrPoc } from "../../organizations/entities/csr-poc.entity";
import { User } from "../../../users/user.entity";

@Entity("donor_interactions")
export class DonorInteraction extends BaseEntity {
  @ManyToOne(() => Donor, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "donor_id" })
  donor: Donor | null;

  @Column({ type: "int", nullable: true, default: null })
  donor_id: number | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "csr_donor_id" })
  csr_donor: Organization | null;

  @Column({ type: "int", nullable: true, default: null })
  csr_donor_id: number | null;

  @ManyToOne(() => CsrPoc, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "csr_poc_id" })
  csr_poc: CsrPoc | null;

  @Column({ type: "int", nullable: true, default: null })
  csr_poc_id: number | null;

  @Column({ type: "varchar", length: 64 })
  activity_type: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  custom_activity_title: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "assigned_to_user_id" })
  assigned_to: User | null;

  @Column({ type: "int", nullable: true })
  assigned_to_user_id: number | null;

  @Column({ type: "timestamp" })
  activity_datetime: Date;

  @Column({ type: "text" })
  user_action_text: string;

  @Column({ type: "text", nullable: true })
  donor_response_text: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  donor_response_type: string | null;

  @Column({ type: "text", nullable: true })
  next_action_text: string | null;

  @Column({ type: "timestamp", nullable: true })
  next_followup_datetime: Date | null;

  @Column({ type: "varchar", length: 32, default: "need_followup" })
  status: string;

  /** Links automated template sends to communication_logs for webhook sync. */
  @Column({ type: "int", nullable: true, default: null })
  communication_log_id: number | null;
}
