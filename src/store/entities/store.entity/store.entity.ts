import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../../users/user.entity';

@Entity('store')
export class StoreEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'int' })
  demandGenerated: number;

  @Column({ type: 'int' })
  pendingDemands: number;

  @Column({ type: 'int' })
  generatedGRN: number;

  @Column({ type: 'int' })
  pendingGRN: number;

  @Column({ type: 'int' })
  rejectedDemands: number;

  // @Column({ nullable: true })
  // createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
