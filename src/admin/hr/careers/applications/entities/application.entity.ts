import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/utils/base_utils/entities/baseEntity';

@Entity('job_applications')
export class Application extends BaseEntity {
  @Column({ name: 'applicant_name', type: 'varchar', length: 255, nullable: false })
  applicant_name: string;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: false })
  email: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: false })
  phone_number: string;

  @Column({ name: 'resume_url', type: 'varchar', length: 500, nullable: true })
  resume_url: string;

  @Column({ name: 'cover_letter', type: 'text', nullable: false })
  cover_letter: string;

  @Column({ name: 'job_id', type: 'int', nullable: false })
  job_id: number;
}
