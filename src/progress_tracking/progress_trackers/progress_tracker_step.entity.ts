import { Entity, Column, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../utils/base_utils/entities/baseEntity';
import { ProgressTracker } from './progress_tracker.entity';
import { ProgressWorkflowTemplateStep } from '../progress_workflow_templates/progress_workflow_template_step.entity';
import { ProgressStatus } from '../common/progress-tracking.enum';
import { ProgressStepEvidence } from './progress_step_evidence.entity';

@Entity('progress_tracker_steps')
@Index(['tracker_id', 'step_key'], { unique: true })
export class ProgressTrackerStep extends BaseEntity {
  @ManyToOne(() => ProgressTracker, (tracker) => tracker.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tracker_id' })
  tracker: ProgressTracker;

  @Column({ type: 'bigint' })
  tracker_id: number;

  @ManyToOne(() => ProgressWorkflowTemplateStep, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_step_id' })
  template_step: ProgressWorkflowTemplateStep;

  @Column({ type: 'bigint', nullable: true })
  template_step_id: number;

  @Column()
  step_key: string;

  @Column()
  title: string;

  @Column()
  step_order: number;

  @Column({ type: 'enum', enum: ProgressStatus, default: ProgressStatus.PENDING })
  status: ProgressStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: object;

  @Column({ type: 'timestamp with time zone', nullable: true })
  started_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completed_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  skipped_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  cancelled_at: Date;

  @Column({ default: false })
  donor_visible: boolean;

  @OneToMany(() => ProgressStepEvidence, (evidence) => evidence.tracker_step)
  evidence: ProgressStepEvidence[];
}
