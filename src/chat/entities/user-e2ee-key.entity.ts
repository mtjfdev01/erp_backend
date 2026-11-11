import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_e2ee_keys')
export class UserE2eeKeyEntity {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  user_id: string;

  @Column({ type: 'text' })
  public_key: string;

  @Column({ type: 'text', nullable: true })
  encrypted_private_key?: string;

  @Column({ type: 'text', nullable: true })
  key_derivation_salt?: string;

  @Column({ type: 'varchar', length: 30, default: 'RSA-OAEP' })
  key_type: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}
