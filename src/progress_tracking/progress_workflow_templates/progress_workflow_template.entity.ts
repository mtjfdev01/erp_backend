import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../utils/base_utils/entities/baseEntity';
import { ProgressWorkflowTemplateStep } from './progress_workflow_template_step.entity';
import { ProgressTracker } from '../progress_trackers/progress_tracker.entity';

@Entity('progress_workflow_templates')
export class ProgressWorkflowTemplate extends BaseEntity {
  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'bigint', nullable: true })
  program_id: number; // Nullable if not tied to a specific program

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => ProgressWorkflowTemplateStep, (step) => step.template)
  steps: ProgressWorkflowTemplateStep[];

  @OneToMany(() => ProgressTracker, (tracker) => tracker.template)
  trackers: ProgressTracker[];
}
