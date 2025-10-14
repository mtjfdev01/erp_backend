import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../utils/base_utils/entities/baseEntity';

export enum BoxType {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  CUSTOM = 'custom',
}

export enum BoxStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
  RETIRED = 'retired',
}

export enum CollectionFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BI_WEEKLY = 'bi-weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  AS_NEEDED = 'as-needed',
}

@Entity('donation_boxes')
export class DonationBox extends BaseEntity {
  // Box Identification
  @Column({ unique: true })
  box_id_no: string;

  @Column({ nullable: true })
  key_no: string;

  // Location Details
  @Column()
  region: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  route: string;

  // Shop Details
  @Column()
  shop_name: string;

  @Column({ nullable: true })
  shopkeeper: string;

  @Column({ nullable: true })
  cell_no: string;

  @Column({ nullable: true })
  landmark_marketplace: string;

  // Box Details
  @Column({
    type: 'enum',
    enum: BoxType,
    default: BoxType.MEDIUM,
  })
  box_type: BoxType;

  @Column({
    type: 'enum',
    enum: BoxStatus,
    default: BoxStatus.ACTIVE,
  })
  status: BoxStatus;

  @Column({
    type: 'enum',
    enum: CollectionFrequency,
    default: CollectionFrequency.WEEKLY,
  })
  frequency: CollectionFrequency;

  // Reference & Dates
  @Column({ nullable: true })
  frd_officer_reference: string;

  @Column({ type: 'date' })
  active_since: Date;

  @Column({ type: 'date', nullable: true })
  last_collection_date: Date;

  // Collection Statistics
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_collected: number;

  @Column({ type: 'int', default: 0 })
  collection_count: number;

  // Additional Info
  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: true })
  is_active: boolean;
}

