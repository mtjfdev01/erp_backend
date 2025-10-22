import { Entity, Column, PrimaryGeneratedColumn, OneToOne, UpdateDateColumn } from 'typeorm';
import { PermissionsEntity } from '../permissions/entities/permissions.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export enum Department {
  STORE = 'store',
  PROCUREMENTS = 'procurements',
  PROGRAM = 'program',
  ACCOUNTS_AND_FINANCE = 'accounts_and_finance',
  ADMIN = 'admin',
  FUND_RAISING = 'fund_raising',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: Department,
  })
  department: Department;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp', precision: 6, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  // Password reset fields
  @Column({ nullable: true })
  resetToken: string;

  @Column({ nullable: true })
  resetTokenExpiry: Date;

  // New fields in snake_case
  @Column({ name: 'first_name', nullable: true })
  first_name: string;

  @Column({ name: 'last_name', nullable: true })
  last_name: string;

  @Column({ name: 'phone', nullable: true })
  phone: string;

  @Column({ name: 'dob', type: 'date', nullable: true })
  dob: string;

  @Column({ name: 'address', nullable: true })
  address: string;

  @Column({ name: 'cnic', nullable: true })
  cnic: string;

  @Column({ name: 'gender', nullable: true })
  gender: string;

  @Column({ name: 'joining_date', type: 'date', nullable: true })
  joining_date: string;

  @Column({ name: 'emergency_contact', nullable: true })
  emergency_contact: string;

  @Column({ name: 'blood_group', nullable: true })
  blood_group: string;

  // One-to-One relationship with permissions
  @OneToOne(() => PermissionsEntity, (permissions) => permissions.user)
  permissions: PermissionsEntity;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  is_archived: boolean;
} 