import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('chat_conversations')
export class ConversationEntity {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 30, default: 'group' })
  type: string; // 'direct' | 'group' | 'channel'

  @Column({ type: 'varchar', length: 60, nullable: true })
  avatar_bg: string | null;

  @Column({ type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'jsonb', default: [] })
  participant_ids: string[];

  @Column({ type: 'jsonb', default: [] })
  admin_ids: string[];

  @Column({ type: 'varchar', length: 60, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  department_id: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  created_by: string | null;

  @Column({ type: 'boolean', default: false })
  is_readonly: boolean;

  @Index()
  @Column({ type: 'varchar', length: 60, nullable: true })
  linked_task_id: string | null;

  @Column({ type: 'boolean', default: false })
  is_pinned: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  last_message: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  unread_counts: Record<string, number> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}
