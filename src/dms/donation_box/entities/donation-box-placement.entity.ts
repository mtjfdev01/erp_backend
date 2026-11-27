import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { DonationBox } from "./donation-box.entity";
import { CsrPoc } from "../../organizations/entities/csr-poc.entity";
import { City } from "../../geographic/cities/entities/city.entity";
import { Route } from "../../geographic/routes/entities/route.entity";

/**
 * Tracks a Collection Unit placement period with a shop / POC.
 * Open period = ended_at IS NULL (current placement).
 */
@Entity("donation_box_placements")
@Index("idx_db_placement_box", ["donation_box_id"])
@Index("idx_db_placement_poc", ["csr_poc_id"])
@Index("idx_db_placement_open", ["donation_box_id", "ended_at"])
export class DonationBoxPlacement extends BaseEntity {
  @Column({ type: "int" })
  donation_box_id: number;

  @ManyToOne(() => DonationBox, { onDelete: "CASCADE" })
  @JoinColumn({ name: "donation_box_id" })
  donation_box: DonationBox;

  @Column({ type: "int", nullable: true, default: null })
  csr_poc_id: number | null;

  @ManyToOne(() => CsrPoc, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "csr_poc_id" })
  csr_poc: CsrPoc | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  shop_name: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  shopkeeper: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, default: null })
  cell_no: string | null;

  @Column({ type: "int", nullable: true, default: null })
  city_id: number | null;

  @ManyToOne(() => City, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "city_id" })
  city: City | null;

  @Column({ type: "int", nullable: true, default: null })
  route_id: number | null;

  @ManyToOne(() => Route, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "route_id" })
  route: Route | null;

  @Column({ type: "date" })
  started_at: Date;

  /** Null = currently active placement for this box. */
  @Column({ type: "date", nullable: true, default: null })
  ended_at: Date | null;

  @Column({ type: "text", nullable: true, default: null })
  note: string | null;
}
