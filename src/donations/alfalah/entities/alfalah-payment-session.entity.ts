import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("alfalah_payment_sessions")
export class AlfalahPaymentSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: "int" })
  donation_id: number;

  @Column({ type: "varchar", length: 8 })
  transaction_type_id: string;

  @Column({ type: "text" })
  auth_token: string;

  @Column({ type: "text", nullable: true })
  hash_key: string | null;

  @Column({ type: "boolean", default: true })
  is_otp: boolean;

  @Column({ type: "varchar", nullable: true })
  transaction_reference: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
