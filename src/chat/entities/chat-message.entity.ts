import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('chat_messages')
@Index(['chat_id', 'created_at'])
@Index(['conversation_id', 'created_at'])
@Index(['created_at'])
export class ChatMessageEntity {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  chat_id: string;

  @Index()
  @Column({ type: 'varchar', length: 120, nullable: true })
  conversation_id: string | null;

  @Column({ type: 'varchar', length: 60 })
  sender_id: string;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 30, default: 'text' })
  type: string;

  @Column({ type: 'varchar', length: 20, default: 'delivered' })
  status: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  delivery_status: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  timestamp: string;

  @Column({ type: 'jsonb', nullable: true })
  reply_to: Record<string, any> | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  parent_message_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  attachment: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  attachments: Array<Record<string, any>> | null;

  @Column({ type: 'int', nullable: true })
  voice_duration: number | null;

  @Index()
  @Column({ type: 'varchar', length: 60, nullable: true })
  task_id: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  linked_task_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  mentions: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  reactions: Array<{ emoji: string; userIds: string[] }> | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  read_at: Date | null;

  @Column({ type: 'jsonb', default: {} })
  read_by: Record<string, string>;

  @Column({ type: 'jsonb', default: {} })
  delivered_to: Record<string, string>;

  @Column({ type: 'boolean', default: false })
  is_edited: boolean;

  @Column({ type: 'boolean', default: false })
  is_deleted: boolean;

  @Column({ type: 'boolean', default: false })
  is_encrypted: boolean;

  @Column({ type: 'int', default: 1 })
  key_version: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}
