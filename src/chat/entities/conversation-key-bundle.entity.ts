import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('conversation_key_bundles')
export class ConversationKeyBundleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  conversation_id: string;

  @Column({ type: 'int', default: 1 })
  key_version: number;

  @Index()
  @Column({ type: 'varchar', length: 60 })
  user_id: string;

  @Column({ type: 'text' })
  encrypted_key: string;

  @Column({ type: 'varchar', length: 60 })
  created_by: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}
