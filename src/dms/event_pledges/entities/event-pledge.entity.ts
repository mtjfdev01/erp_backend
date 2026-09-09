import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { Column, Entity } from "typeorm";

export type EventPledgeDonationType = "general" | "zakat";

@Entity("event_pledges")
export class EventPledge extends BaseEntity {
  @Column({ type: "varchar", length: 255 })
  donor_name: string;

  @Column({ type: "varchar", length: 50, nullable: true, default: null })
  contact_number: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  care_of_representative: string | null;

  /** general | zakat */
  @Column({ type: "varchar", length: 20, default: "general" })
  donation_type: EventPledgeDonationType;

  @Column({ type: "numeric", precision: 14, scale: 2 })
  donation_amount: string;

  @Column({ type: "text", nullable: true, default: null })
  address: string | null;
}
