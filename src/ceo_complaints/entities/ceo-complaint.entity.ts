import {
  Entity,
  Column,
  Index,
} from "typeorm";
import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import {
  CeoComplaintCategory,
  CeoComplaintDepartment,
  CeoComplaintOrganization,
  CeoComplaintPriority,
  CeoComplaintStatus,
  CeoComplaintSubmissionChannel,
  CeoComplainantType,
} from "../ceo-complaints.constants";

@Entity("ceo_complaints")
@Index("idx_ceo_complaints_complaint_number", ["complaint_number"], {
  unique: true,
})
@Index("idx_ceo_complaints_organization", ["organization"])
@Index("idx_ceo_complaints_department", ["department"])
@Index("idx_ceo_complaints_category", ["category"])
@Index("idx_ceo_complaints_priority", ["priority"])
@Index("idx_ceo_complaints_status", ["status"])
@Index("idx_ceo_complaints_created_at", ["created_at"])
export class CeoComplaint extends BaseEntity {
  @Column({ type: "varchar", length: 32 })
  complaint_number: string;

  @Column({ type: "varchar", length: 40 })
  organization: CeoComplaintOrganization;

  /** Required when organization = aslab. */
  @Column({ type: "varchar", length: 80, nullable: true, default: null })
  branch: string | null;

  @Column({ type: "varchar", length: 40 })
  complainant_type: CeoComplainantType;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  complainant_name: string | null;

  @Column({ type: "varchar", length: 40, nullable: true, default: null })
  contact_number: string | null;

  /** Department the complaint relates to. */
  @Column({ type: "varchar", length: 40, nullable: true, default: null })
  department: CeoComplaintDepartment | null;

  /** Complaint type (کمپلینٹ ٹائپ). */
  @Column({ type: "varchar", length: 60 })
  category: CeoComplaintCategory;

  /** Preferential priority / ترجیح — derived from category. */
  @Column({ type: "varchar", length: 40, nullable: true, default: null })
  priority: CeoComplaintPriority | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  category_other: string | null;

  @Column({ type: "text" })
  details: string;

  @Column({
    type: "varchar",
    length: 40,
    default: CeoComplaintStatus.SUBMITTED,
  })
  status: CeoComplaintStatus;

  @Column({
    type: "varchar",
    length: 20,
    default: CeoComplaintSubmissionChannel.WEBSITE,
  })
  submission_channel: CeoComplaintSubmissionChannel;
}
