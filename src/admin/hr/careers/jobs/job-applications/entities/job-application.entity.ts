import { BaseEntity } from 'src/utils/base_utils/entities/baseEntity';
import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Job } from '../../entities/job.entity';
import { User } from 'src/users/user.entity';

export enum ApplicationStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  SHORTLISTED = 'shortlisted',
  REJECTED = 'rejected',
  HIRED = 'hired',
}

@Entity('job_applications')
@Index('idx_job_applications_job_id', ['job_id'])
@Index('idx_job_applications_email', ['email'])
@Index('idx_job_applications_status', ['status'])
@Index('idx_job_applications_application_date', ['application_date'])
export class JobApplication extends BaseEntity {
  // Foreign key relationship to Job
  @ManyToOne(() => Job, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column()
  job_id: number;

  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'text' })
  cover_letter: string;

  @Column({ type: 'varchar', length: 500 })
  cv_resume: string;

  @Column({ type: 'boolean', default: false })
  consent: boolean;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.PENDING,
  })
  status: ApplicationStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  application_date: Date;

  // Reviewer information
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewed_by: User;

  @Column({ nullable: true })
  reviewed_by_id: number;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;
}

