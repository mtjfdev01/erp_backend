import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { Column, Entity, Index } from "typeorm";

/** Master subscription row vs each paid billing cycle. */
export type RecurringDonationRecordType = "subscription" | "installment";

@Entity("recurring_donations")
export class RecurringDonation extends BaseEntity {
  @Column({ type: "varchar", length: 20, default: "subscription" })
  record_type: RecurringDonationRecordType;

  /** For installments: points to the subscription master row. */
  @Column({ type: "int", nullable: true, default: null })
  parent_id: number | null;

  @Index()
  @Column({ type: "int", nullable: true, default: null })
  initial_donation_id: number | null;

  @Column({ type: "int", nullable: true, default: null })
  donor_id: number | null;

  @Index()
  @Column({ type: "varchar", nullable: true, default: null })
  stripe_subscription_id: string | null;

  @Column({ type: "varchar", nullable: true, default: null })
  stripe_customer_id: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true, default: null })
  stripe_invoice_id: string | null;

  @Column({ type: "varchar", nullable: true, default: null })
  stripe_payment_intent_id: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true, default: null })
  stripe_event_id: string | null;

  @Column({ type: "varchar", nullable: true, default: null })
  billing_interval: string | null;

  @Column({ type: "int", nullable: true, default: 1 })
  billing_interval_count: number | null;

  /** Website / Stripe schedule: same_date | first_of_month | custom */
  @Column({ type: "varchar", length: 32, nullable: true, default: null })
  start_date_mode: string | null;

  /** Intended first billing date (YYYY-MM-DD calendar date stored as date). */
  @Column({ type: "date", nullable: true, default: null })
  start_date: string | null;

  @Column({ type: "boolean", nullable: true, default: null })
  consent: boolean | null;

  @Column({ type: "timestamp", nullable: true, default: null })
  consent_at: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  amount: number | null;

  @Column({ type: "varchar", nullable: true, default: null })
  currency: string | null;

  @Column({ type: "varchar", nullable: true, default: "active" })
  status: string;

  @Column({ type: "varchar", nullable: true, default: null })
  donation_method: string | null;

  @Column({ type: "varchar", nullable: true, default: null })
  project_id: string | null;

  @Column({ type: "bigint", nullable: true, default: null })
  campaign_id: number | null;

  @Column({ type: "varchar", nullable: true, default: null })
  donation_type: string | null;

  @Column({ type: "timestamp", nullable: true, default: null })
  paid_at: Date | null;

  @Column({ type: "varchar", nullable: true, default: null })
  stripe_billing_reason: string | null;
}
