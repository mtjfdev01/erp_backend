import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { Job } from "../../jobs/entities/job.entity";

export enum ApplicationStatus {
  PENDING = "pending",
  REVIEWED = "reviewed",
  SHORTLISTED = "shortlisted",
  REJECTED = "rejected",
  HIRED = "hired",
}

export type JobApplicationEducationRow = {
  type?: string;
  program?: string;
  specialization?: string;
  yearOfCompletion?: string;
  resultStatus?: string;
};

export type JobApplicationExperienceRow = {
  company?: string;
  jobTitle?: string;
  description?: string;
  location?: string;
  totalExperience?: string;
};

export type JobApplicationDisclosure = {
  dismissed?: string;
  serviceBond?: string;
  criminalCharges?: string;
  relativeWorking?: string;
  approachEmployer?: string;
};

@Entity("job_applications")
@Index("idx_job_applications_job_id", ["job_id"])
@Index("idx_job_applications_status", ["status"])
@Index("idx_job_applications_email", ["email"])
@Index("idx_job_applications_cnic", ["cnic"])
export class Application extends BaseEntity {
  /** Denormalized display name (first + last). */
  @Column({
    name: "applicant_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  applicant_name: string | null;

  @Column({ name: "first_name", type: "varchar", length: 120, nullable: true })
  first_name: string | null;

  @Column({ name: "last_name", type: "varchar", length: 120, nullable: true })
  last_name: string | null;

  @Column({ name: "father_name", type: "varchar", length: 255, nullable: true })
  father_name: string | null;

  @Column({ name: "cnic", type: "varchar", length: 20, nullable: true })
  cnic: string | null;

  /** e.g. not_applicable | yes | no */
  @Column({ name: "disability", type: "varchar", length: 40, nullable: true })
  disability: string | null;

  @Column({ name: "gender", type: "varchar", length: 20, nullable: true })
  gender: string | null;

  @Column({
    name: "marital_status",
    type: "varchar",
    length: 30,
    nullable: true,
  })
  marital_status: string | null;

  @Column({
    name: "husband_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  husband_name: string | null;

  @Column({ name: "email", type: "varchar", length: 255, nullable: true })
  email: string | null;

  /** Primary mobile. */
  @Column({ name: "phone_number", type: "varchar", length: 30, nullable: true })
  phone_number: string | null;

  @Column({ name: "office_phone", type: "varchar", length: 30, nullable: true })
  office_phone: string | null;

  @Column({
    name: "residence_phone",
    type: "varchar",
    length: 30,
    nullable: true,
  })
  residence_phone: string | null;

  @Column({ name: "country", type: "varchar", length: 120, nullable: true })
  country: string | null;

  @Column({ name: "state", type: "varchar", length: 120, nullable: true })
  state: string | null;

  @Column({ name: "city", type: "varchar", length: 120, nullable: true })
  city: string | null;

  @Column({ name: "postal_code", type: "varchar", length: 30, nullable: true })
  postal_code: string | null;

  @Column({ name: "current_address", type: "text", nullable: true })
  current_address: string | null;

  @Column({ name: "permanent_address", type: "text", nullable: true })
  permanent_address: string | null;

  @Column({
    name: "education",
    type: "jsonb",
    nullable: true,
    default: () => "'[]'",
  })
  education: JobApplicationEducationRow[] | null;

  @Column({
    name: "has_work_experience",
    type: "boolean",
    nullable: true,
    default: null,
  })
  has_work_experience: boolean | null;

  @Column({
    name: "experience",
    type: "jsonb",
    nullable: true,
    default: () => "'[]'",
  })
  experience: JobApplicationExperienceRow[] | null;

  @Column({
    name: "disclosure",
    type: "jsonb",
    nullable: true,
    default: () => "'{}'",
  })
  disclosure: JobApplicationDisclosure | null;

  @Column({ name: "resume_url", type: "varchar", length: 1000, nullable: true })
  resume_url: string | null;

  @Column({
    name: "resume_file_key",
    type: "varchar",
    length: 500,
    nullable: true,
  })
  resume_file_key: string | null;

  @Column({
    name: "original_filename",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  original_filename: string | null;

  @Column({ name: "cover_letter", type: "text", nullable: true })
  cover_letter: string | null;

  @Column({
    name: "status",
    type: "varchar",
    length: 30,
    default: ApplicationStatus.PENDING,
  })
  status: ApplicationStatus;

  @Column({ name: "job_id", type: "int", nullable: true })
  job_id: number | null;

  /** Legacy rows may reference deleted jobs, so no DB FK constraint. */
  @ManyToOne(() => Job, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "job_id" })
  job: Job | null;
}
