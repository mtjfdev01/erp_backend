import {
  Entity,
  Column,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Index,
} from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { Route } from "../../geographic/routes/entities/route.entity";
import { User } from "../../../users/user.entity";

export enum BoxType {
  SMALL = "small",
  MEDIUM = "medium",
  LARGE = "large",
  CUSTOM = "custom",
}

export enum BoxStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  MAINTENANCE = "maintenance",
  RETIRED = "retired",
}

export enum CollectionFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  BI_WEEKLY = "bi-weekly",
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  AS_NEEDED = "as-needed",
}

@Entity("donation_boxes")
@Index("idx_donation_box_route", ["route_id"])
export class DonationBox extends BaseEntity {
  /** External box number from field sheets (e.g. FSD-L-141). Alias: Box ID No. / Box No. */
  @Column({ name: "box_id_no", type: "varchar", nullable: true, unique: true })
  box_id_no: string | null;

  @Column({ nullable: true })
  key_no: string;

  // Location Details - Foreign Key
  @Column({ nullable: true })
  route_id: number;

  @Column({ nullable: true })
  city_id: number;

  // Shop Details
  @Column()
  shop_name: string;

  @Column({ nullable: true })
  shopkeeper: string;

  @Column({ nullable: true })
  cell_no: string;

  /** Free-text shop address from field sheets. */
  @Column({ type: "text", nullable: true })
  address: string | null;

  @Column({ nullable: true })
  landmark_marketplace: string;

  /** Normalized search blob from route, region, city, landmark, and shop name. */
  @Column({ type: "text", nullable: true, default: null })
  geo_search: string;

  /** GPS coordinates captured when the box was registered at the shop. */
  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  registration_latitude: number;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  registration_longitude: number;

  /** Human-readable place name from reverse geocoding at registration. */
  @Column({ type: "text", nullable: true })
  registration_location_name: string;

  /** Structured address from reverse geocoding (shop/point, road, city, etc.). */
  @Column({ type: "jsonb", nullable: true })
  registration_location_details: Record<string, string> | null;

  /** Allowed distance (meters) from registration point for collections. */
  @Column({ type: "int", default: 100 })
  location_radius_meters: number;

  /**
   * When true, collectors must be at the box's device GPS point (unless user has bypass permission).
   * When false, this box can be collected from anywhere with no GPS check.
   */
  @Column({ default: true })
  require_collection_location: boolean;

  // Box Details
  @Column({
    type: "enum",
    enum: BoxType,
    default: BoxType.MEDIUM,
  })
  box_type: BoxType;

  @Column({
    type: "enum",
    enum: BoxStatus,
    default: BoxStatus.ACTIVE,
  })
  status: BoxStatus;

  @Column({
    type: "enum",
    enum: CollectionFrequency,
    default: CollectionFrequency.WEEKLY,
  })
  frequency: CollectionFrequency;

  @Column({ type: "date" })
  active_since: Date;

  @Column({ type: "date", nullable: true })
  last_collection_date: Date;

  // Collection Statistics
  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  total_collected: number;

  @Column({ type: "int", default: 0 })
  collection_count: number;

  // Additional Info
  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ default: true })
  is_active: boolean;

  // Relationships
  @ManyToOne(() => Route, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "route_id" })
  route: Route;

  @ManyToMany(() => User, (user) => user.donationBoxes, { cascade: true })
  @JoinTable({
    name: "donation_box_users",
    joinColumn: { name: "donation_box_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "user_id", referencedColumnName: "id" },
  })
  assignedUsers: User[];
}
