import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../utils/base_utils/entities/baseEntity";
import { Campaign } from "./campaign.entity";

@Entity("campaign_ad_spends")
@Index("idx_campaign_ad_spends_campaign", ["campaign_id"])
@Index("idx_campaign_ad_spends_platform", ["platform"])
export class CampaignAdSpend extends BaseEntity {
  @ManyToOne(() => Campaign, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: Campaign;

  @Column({ type: "bigint" })
  campaign_id: number;

  @Column({ type: "varchar", length: 120 })
  platform: string;

  @Column({ type: "decimal", precision: 14, scale: 2 })
  amount: number;

  @Column({ type: "date", nullable: true, default: null })
  spend_date: Date | string | null;

  @Column({ type: "text", nullable: true, default: null })
  notes: string | null;

  @Column({ type: "text", nullable: true, default: null })
  attachment_url: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  attachment_name: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, default: null })
  attachment_type: string | null;
}
