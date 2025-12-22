import { BaseEntity } from 'src/utils/base_utils/entities/baseEntity';
import { Entity, Column, Index, OneToMany } from 'typeorm';
import { Application } from '../../applications/entities/application.entity';

export enum JobType {
  FULL_TIME = 'Full Time',
  PART_TIME = 'Part Time',
  CONTRACT = 'Contract',
}

export enum JobStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  DRAFT = 'draft',
}

export enum Department {
  IT = 'IT',
  MARKETING = 'Marketing',
  DESIGN = 'Design',
  OPERATIONS = 'Operations',
}

@Entity('jobs')
@Index('idx_jobs_status', ['status'])
@Index('idx_jobs_department', ['department'])
@Index('idx_jobs_type', ['type'])
@Index('idx_jobs_location', ['location'])
@Index('idx_jobs_posted_date', ['posted_date'])
@Index('idx_jobs_slug', ['slug'], { unique: true })
export class Job extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  icon: string;

  @Column({
    type: 'enum',
    enum: Department,
  })
  department: Department;

  @Column({
    type: 'enum',
    enum: JobType,
  })
  type: JobType;

  @Column({ type: 'varchar', length: 255 })
  location: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  experience: string;

  @Column({ type: 'text' })
  about: string;

  @Column({ type: 'json', nullable: true })
  qualifications: string[];

  @Column({ type: 'json', nullable: true })
  responsibilities: string[];

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.ACTIVE,
  })
  status: JobStatus;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  posted_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  closing_date: Date;

  // // Relationships
  // @OneToMany(() => Application, (application) => application.job, { eager: false })
  // applications: Application[];
}
