import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { Column, Entity, ManyToOne, JoinColumn } from "typeorm";
import { Donor } from "../../dms/donor/entities/donor.entity";

//nullabe true to all column
@Entity('donations')
export class Donation extends BaseEntity {
  // Foreign key relationship to Donor
  @ManyToOne(() => Donor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'donor_id' })
  donor: Donor;

  @Column({ nullable: true, default: null })
  donor_id: number;
  
  @Column({ nullable: true, default: null })
  project_id: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  project_name: string;

  @Column({ type: 'decimal', nullable: true, default: null })
  amount: number;
//   default current date and time
  @Column({ type: 'date', default: () => 'CURRENT_DATE', nullable: true })
  date: Date;
//   currency
  @Column({ type: 'varchar', nullable: true, default: null })
  currency: string;

//   donor section
  @Column({ type: 'varchar', nullable: true, default: null })
  donor_name: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  donor_email: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  donor_phone: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  donation_type: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  donation_method: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  donation_source: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  country: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  city: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  address: string;
//  donation item name and description and price
  @Column({ type: 'varchar', nullable: true, default: null })
  item_name: string;
  @Column({ type: 'varchar', nullable: true, default: null })
  item_description: string;
  @Column({ type: 'decimal', nullable: true, default: null })
  item_price: number;
  @Column({ type: 'varchar', nullable: true, default: 'pending' })
  status: string;
  
  // ⭐ NEW: Cheque payment fields
  @Column({ type: 'varchar', nullable: true, default: null })
  cheque_number: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  bank_name: string;

  // ⭐ NEW: In-kind donation fields
  @Column({ type: 'varchar', nullable: true, default: null })
  in_kind_item_name: string;

  @Column({ type: 'text', nullable: true, default: null })
  in_kind_description: string;

  @Column({ type: 'int', nullable: true, default: null })
  in_kind_quantity: number;
  
  // Order ID returned by the bank
  @Column({ type: 'varchar', nullable: true, default: null })
  orderId: string;
//   recurrence id in case of recurring donation and is returned by meezan bank
  @Column({ type: 'varchar', nullable: true, default: null })
  recurrence_id: string;
}
