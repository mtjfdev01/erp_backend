import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";

export type RecurringReminderLogSource =
  | "campaign_pledge"
  | "ledger_subscription";

export type RecurringReminderLogAction = "reminder" | "thanks";

export type RecurringReminderChannelStatus = "sent" | "not_sent" | "n_a";

@Entity("recurring_reminder_logs")
export class RecurringReminderLog extends BaseEntity {
  /** Groups rows from one cron / manual job run. */
  @Index()
  @Column({ type: "varchar", length: 64 })
  run_id: string;

  @Index()
  @Column({ type: "varchar", length: 40, default: "campaign_pledge" })
  source: RecurringReminderLogSource;

  @Index()
  @Column({ type: "varchar", length: 20, default: "reminder" })
  action_type: RecurringReminderLogAction;

  @Column({ type: "varchar", length: 40, nullable: true, default: null })
  frequency: string | null;

  @Index()
  @Column({ type: "varchar", length: 64, nullable: true, default: null })
  period_key: string | null;

  @Index()
  @Column({ type: "int", nullable: true, default: null })
  donor_id: number | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  donor_name: string | null;

  @Index()
  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  donor_email: string | null;

  @Column({ type: "varchar", length: 40, nullable: true, default: null })
  donor_phone: string | null;

  /** Mail channel: sent / not_sent / n_a (not attempted). */
  @Column({ type: "varchar", length: 20, default: "n_a" })
  mail_status: RecurringReminderChannelStatus;

  /** WhatsApp channel: sent / not_sent / n_a (not attempted). */
  @Column({ type: "varchar", length: 20, default: "n_a" })
  wa_status: RecurringReminderChannelStatus;

  @Column({ type: "int", nullable: true, default: null })
  pledge_id: number | null;

  @Column({ type: "int", nullable: true, default: null })
  recurring_donation_id: number | null;

  @Column({ type: "int", nullable: true, default: null })
  campaign_id: number | null;

  @Column({ type: "varchar", length: 255, nullable: true, default: null })
  campaign_title: string | null;

  @Column({ type: "int", nullable: true, default: null })
  donation_id: number | null;

  @Column({ type: "boolean", default: false })
  dry_run: boolean;

  @Column({ type: "text", nullable: true, default: null })
  error_message: string | null;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true, default: null })
  amount: number | null;

  @Column({ type: "varchar", length: 10, nullable: true, default: null })
  currency: string | null;
}
