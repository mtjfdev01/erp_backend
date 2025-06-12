import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('procurements')
export class ProcurementsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'int' })
  totalGeneratedPOs: number;

  @Column({ type: 'int' })
  pendingPOs: number;

  @Column({ type: 'int' })
  fulfilledPOs: number;

  @Column({ type: 'int' })
  totalGeneratedPIs: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPaidAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unpaidAmount: number;

  @Column({ type: 'int' })
  unpaidPIs: number;

  @Column({ type: 'int' })
  tenders: number;

  @CreateDateColumn()
  createdAt: Date;
}
