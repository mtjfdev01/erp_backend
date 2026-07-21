import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository, In } from "typeorm";
import { ManualRecurringPledge } from "./entities/manual-recurring-pledge.entity";
import { ManualRecurringStatus } from "./utils/manual-recurring.constants";
import {
  formatPledgeItemsSummary,
  formatPrepaidCoverageLabel,
  isPrepaidPeriodCovered,
} from "./utils/manual-recurring-pledge.util";
import {
  formatPeriodKeyLabel,
  getMonthlyPeriodBounds,
  getMonthlyPeriodKey,
} from "./utils/manual-recurring-period.util";
import {
  resolveChunkDelayMs,
  resolveChunkSize,
  resolveMaxDetails,
  sleep,
} from "./utils/manual-recurring-chunk.util";
import { Donation } from "../../donations/entities/donation.entity";
import { RecurringDonation } from "../../donations/recurring_donations/entities/recurring-donation.entity";
import { EmailTemplateService } from "../email_template/email_template.service";
import { Campaign, CampaignStatus } from "../campaigns/entities/campaign.entity";
import { ProcessManualRecurringRemindersDto } from "./dto/manual-recurring-filters.dto";
import {
  CampaignTemplateSlot,
  getSlotTemplateId,
  isSlotEnabled,
  SLOT_TO_TEMPLATE_PURPOSE,
} from "../campaigns/utils/campaign-communication.constants";

export interface ManualRecurringReminderDetail {
  pledge_id: number;
  donor_id: number;
  donor_name: string;
  campaign_id: number;
  campaign_title: string;
  action: string;
  channels?: string[];
  error?: string;
}

export interface ManualRecurringReminderResult {
  period_key: string;
  period_label: string;
  scanned: number;
  skipped_donated: number;
  skipped_stripe_auto: number;
  skipped_no_contact: number;
  skipped_already_reminded: number;
  skipped_already_thanked: number;
  skipped_unsubscribed: number;
  skipped_inactive_donor: number;
  skipped_campaign_disabled: number;
  skipped_prepaid_covered: number;
  reminders_sent: number;
  thanks_sent: number;
  reminders_failed: number;
  thanks_failed: number;
  would_send_count: number;
  would_thank_count: number;
  dry_run: boolean;
  chunk_size: number;
  chunks_processed: number;
  details_truncated: boolean;
  details: ManualRecurringReminderDetail[];
}

@Injectable()
export class ManualRecurringReminderService {
  private readonly logger = new Logger(ManualRecurringReminderService.name);

  constructor(
    @InjectRepository(ManualRecurringPledge)
    private readonly pledgeRepo: Repository<ManualRecurringPledge>,
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(RecurringDonation)
    private readonly stripeRecurringRepo: Repository<RecurringDonation>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly configService: ConfigService,
  ) {}

  async processMonthlyReminders(
    options: ProcessManualRecurringRemindersDto = {},
  ): Promise<ManualRecurringReminderResult> {
    const periodKey = options.period_key || getMonthlyPeriodKey();
    const dryRun = options.dry_run === true;
    const force = options.force === true;
    const chunkSize = options.chunk_size || resolveChunkSize(this.configService);
    const chunkDelayMs = resolveChunkDelayMs(this.configService);
    const includeDetails = options.include_details === true;
    const maxDetails = resolveMaxDetails(includeDetails, this.configService);

    const periodBounds = getMonthlyPeriodBounds(
      new Date(`${periodKey}-15T12:00:00`),
    );

    const stripeAutoDonorIds = await this.getStripeAutoDonorIds();
    const purposeFallbackCache = new Map<string, number | null>();

    const result: ManualRecurringReminderResult = {
      period_key: periodKey,
      period_label: formatPeriodKeyLabel(periodKey),
      scanned: 0,
      skipped_donated: 0,
      skipped_stripe_auto: 0,
      skipped_no_contact: 0,
      skipped_already_reminded: 0,
      skipped_already_thanked: 0,
      skipped_unsubscribed: 0,
      skipped_inactive_donor: 0,
      skipped_campaign_disabled: 0,
      skipped_prepaid_covered: 0,
      reminders_sent: 0,
      thanks_sent: 0,
      reminders_failed: 0,
      thanks_failed: 0,
      would_send_count: 0,
      would_thank_count: 0,
      dry_run: dryRun,
      chunk_size: chunkSize,
      chunks_processed: 0,
      details_truncated: false,
      details: [],
    };

    let lastPledgeId = 0;
    let hasMore = true;

    while (hasMore) {
      const pledges = await this.pledgeRepo
        .createQueryBuilder("pledge")
        .innerJoinAndSelect("pledge.donor", "donor")
        .innerJoinAndSelect("pledge.campaign", "campaign")
        .leftJoinAndSelect("pledge.lines", "lines")
        .leftJoinAndSelect("lines.campaign_item", "campaign_item")
        .where("pledge.status = :status", {
          status: ManualRecurringStatus.ACTIVE,
        })
        .andWhere("pledge.is_archived = false")
        .andWhere("pledge.id > :lastPledgeId", { lastPledgeId })
        .andWhere("campaign.is_recurring = true")
        .andWhere("campaign.monthly_donor_automation_enabled = true")
        .andWhere("campaign.status = :campaignStatus", {
          campaignStatus: CampaignStatus.ACTIVE,
        })
        .orderBy("pledge.id", "ASC")
        .take(chunkSize)
        .getMany();

      if (!pledges.length) break;

      result.chunks_processed += 1;
      result.scanned += pledges.length;
      lastPledgeId = pledges[pledges.length - 1].id;
      hasMore = pledges.length === chunkSize;

      const donatedLookup = await this.buildDonatedLookupForChunk(
        pledges,
        periodBounds.start,
        periodBounds.end,
      );

      const pledgeIdsMarkReminded: number[] = [];
      const pledgeIdsMarkThanked: number[] = [];

      for (const pledge of pledges) {
        const outcome = await this.processOnePledge({
          pledge,
          periodKey,
          dryRun,
          force,
          stripeAutoDonorIds,
          donatedLookup,
          purposeFallbackCache,
        });

        result.skipped_donated += outcome.skipped_donated;
        result.skipped_stripe_auto += outcome.skipped_stripe_auto;
        result.skipped_no_contact += outcome.skipped_no_contact;
        result.skipped_already_reminded += outcome.skipped_already_reminded;
        result.skipped_already_thanked += outcome.skipped_already_thanked;
        result.skipped_unsubscribed += outcome.skipped_unsubscribed;
        result.skipped_inactive_donor += outcome.skipped_inactive_donor;
        result.skipped_campaign_disabled += outcome.skipped_campaign_disabled;
        result.skipped_prepaid_covered += outcome.skipped_prepaid_covered;
        result.reminders_sent += outcome.reminders_sent;
        result.thanks_sent += outcome.thanks_sent;
        result.reminders_failed += outcome.reminders_failed;
        result.thanks_failed += outcome.thanks_failed;
        result.would_send_count += outcome.would_send;
        result.would_thank_count += outcome.would_thank;

        if (outcome.markReminded) pledgeIdsMarkReminded.push(pledge.id);
        if (outcome.markThanked) pledgeIdsMarkThanked.push(pledge.id);

        if (outcome.detail) {
          this.appendDetail(result, outcome.detail, maxDetails);
        }
      }

      if (!dryRun) {
        if (pledgeIdsMarkReminded.length) {
          await this.pledgeRepo.update(
            { id: In(pledgeIdsMarkReminded) },
            {
              last_reminder_period_key: periodKey,
              last_reminder_sent_at: new Date(),
            },
          );
        }
        if (pledgeIdsMarkThanked.length) {
          await this.pledgeRepo.update(
            { id: In(pledgeIdsMarkThanked) },
            {
              last_thanks_period_key: periodKey,
              last_thanks_sent_at: new Date(),
            },
          );
        }
      }

      this.logger.log(
        `Recurring campaign chunk #${result.chunks_processed} (${periodKey}) — batch: ${pledges.length}, reminders: ${result.reminders_sent}, thanks: ${result.thanks_sent}`,
      );

      if (hasMore && chunkDelayMs > 0) {
        await sleep(chunkDelayMs);
      }
    }

    this.logger.log(
      `Recurring campaign monthly job (${periodKey}) — scanned: ${result.scanned}, reminders: ${result.reminders_sent}, thanks: ${result.thanks_sent}, dryRun: ${dryRun}`,
    );

    return result;
  }

  private appendDetail(
    result: ManualRecurringReminderResult,
    detail: ManualRecurringReminderDetail,
    maxDetails: number,
  ) {
    if (result.details.length >= maxDetails) {
      result.details_truncated = true;
      return;
    }
    result.details.push(detail);
  }

  private async processOnePledge(params: {
    pledge: ManualRecurringPledge;
    periodKey: string;
    dryRun: boolean;
    force: boolean;
    stripeAutoDonorIds: Set<number>;
    donatedLookup: Map<number, Set<number>>;
    purposeFallbackCache: Map<string, number | null>;
  }) {
    const {
      pledge,
      periodKey,
      dryRun,
      force,
      stripeAutoDonorIds,
      donatedLookup,
      purposeFallbackCache,
    } = params;

    const campaign = pledge.campaign;
    const donor = pledge.donor;
    const donorName =
      donor?.name || donor?.email || `Donor #${pledge.donor_id}`;
    const campaignTitle = campaign?.title || `Campaign #${pledge.campaign_id}`;

    const baseDetail = {
      pledge_id: pledge.id,
      donor_id: pledge.donor_id,
      donor_name: donorName,
      campaign_id: pledge.campaign_id,
      campaign_title: campaignTitle,
    };

    const zero = {
      skipped_donated: 0,
      skipped_stripe_auto: 0,
      skipped_no_contact: 0,
      skipped_already_reminded: 0,
      skipped_already_thanked: 0,
      skipped_unsubscribed: 0,
      skipped_inactive_donor: 0,
      skipped_campaign_disabled: 0,
      skipped_prepaid_covered: 0,
      reminders_sent: 0,
      thanks_sent: 0,
      reminders_failed: 0,
      thanks_failed: 0,
      would_send: 0,
      would_thank: 0,
      markReminded: false,
      markThanked: false,
    };

    if (
      !campaign?.is_recurring ||
      !campaign.monthly_donor_automation_enabled ||
      campaign.status !== CampaignStatus.ACTIVE
    ) {
      return {
        ...zero,
        skipped_campaign_disabled: 1,
        detail: { ...baseDetail, action: "skipped_campaign_automation_off" },
      };
    }

    if (!donor || donor.is_archived || donor.is_active === false) {
      return {
        ...zero,
        skipped_inactive_donor: 1,
        detail: { ...baseDetail, action: "skipped_inactive_donor" },
      };
    }

    if (donor.notification_subscription === false) {
      return {
        ...zero,
        skipped_unsubscribed: 1,
        detail: { ...baseDetail, action: "skipped_unsubscribed" },
      };
    }

    if (stripeAutoDonorIds.has(pledge.donor_id)) {
      return {
        ...zero,
        skipped_stripe_auto: 1,
        detail: { ...baseDetail, action: "skipped_stripe_auto_recurring" },
      };
    }

    const hasDonated = this.hasDonatedForCampaign(
      pledge.campaign_id,
      pledge.donor_id,
      donatedLookup,
    );

    if (!hasDonated && isPrepaidPeriodCovered(pledge, periodKey)) {
      return {
        ...zero,
        skipped_prepaid_covered: 1,
        detail: {
          ...baseDetail,
          action: "skipped_prepaid_covered_month",
        },
      };
    }

    if (hasDonated) {
      return this.handleDonatedDonor({
        pledge,
        campaign,
        donor,
        periodKey,
        dryRun,
        force,
        baseDetail,
        purposeFallbackCache,
      });
    }

    return this.handleNotDonatedDonor({
      pledge,
      campaign,
      donor,
      periodKey,
      dryRun,
      force,
      baseDetail,
      purposeFallbackCache,
    });
  }

  private async handleDonatedDonor(params: {
    pledge: ManualRecurringPledge;
    campaign: Campaign;
    donor: ManualRecurringPledge["donor"];
    periodKey: string;
    dryRun: boolean;
    force: boolean;
    baseDetail: Omit<ManualRecurringReminderDetail, "action">;
    purposeFallbackCache: Map<string, number | null>;
  }) {
    const zero = {
      skipped_donated: 1,
      skipped_stripe_auto: 0,
      skipped_no_contact: 0,
      skipped_already_reminded: 0,
      skipped_already_thanked: 0,
      skipped_unsubscribed: 0,
      skipped_inactive_donor: 0,
      skipped_campaign_disabled: 0,
      skipped_prepaid_covered: 0,
      reminders_sent: 0,
      thanks_sent: 0,
      reminders_failed: 0,
      thanks_failed: 0,
      would_send: 0,
      would_thank: 0,
      markReminded: false,
      markThanked: false,
    };

    if (!isSlotEnabled(params.campaign.communication_templates, "thanks")) {
      return {
        ...zero,
        detail: {
          ...params.baseDetail,
          action: "skipped_donated_no_thanks_template",
        },
      };
    }

    if (
      !params.force &&
      params.pledge.last_thanks_period_key === params.periodKey
    ) {
      return {
        ...zero,
        skipped_already_thanked: 1,
        detail: {
          ...params.baseDetail,
          action: "skipped_already_thanked",
        },
      };
    }

    const channels = this.resolveChannels(params.pledge, params.donor);
    if (!channels.length) {
      return {
        ...zero,
        skipped_no_contact: 1,
        detail: { ...params.baseDetail, action: "skipped_no_contact" },
      };
    }

    if (params.dryRun) {
      return {
        ...zero,
        skipped_donated: 0,
        would_thank: 1,
        detail: {
          ...params.baseDetail,
          action: "would_send_thanks",
          channels,
        },
      };
    }

    const sendResult = await this.sendSlotMessages({
      pledge: params.pledge,
      campaign: params.campaign,
      donorId: params.pledge.donor_id,
      slot: "thanks",
      channels,
      periodKey: params.periodKey,
      purposeFallbackCache: params.purposeFallbackCache,
    });

    if (sendResult.sent > 0) {
      return {
        ...zero,
        skipped_donated: 0,
        thanks_sent: 1,
        markThanked: true,
        thanks_failed: sendResult.failed > 0 ? 1 : 0,
        detail: {
          ...params.baseDetail,
          action: "thanks_sent",
          channels,
          error: sendResult.errors.join("; ") || undefined,
        },
      };
    }

    return {
      ...zero,
      skipped_donated: 0,
      thanks_failed: 1,
      detail: {
        ...params.baseDetail,
        action: "thanks_failed",
        channels,
        error: sendResult.errors.join("; ") || "Send failed",
      },
    };
  }

  private async handleNotDonatedDonor(params: {
    pledge: ManualRecurringPledge;
    campaign: Campaign;
    donor: ManualRecurringPledge["donor"];
    periodKey: string;
    dryRun: boolean;
    force: boolean;
    baseDetail: Omit<ManualRecurringReminderDetail, "action">;
    purposeFallbackCache: Map<string, number | null>;
  }) {
    const zero = {
      skipped_donated: 0,
      skipped_stripe_auto: 0,
      skipped_no_contact: 0,
      skipped_already_reminded: 0,
      skipped_already_thanked: 0,
      skipped_unsubscribed: 0,
      skipped_inactive_donor: 0,
      skipped_campaign_disabled: 0,
      skipped_prepaid_covered: 0,
      reminders_sent: 0,
      thanks_sent: 0,
      reminders_failed: 0,
      thanks_failed: 0,
      would_send: 0,
      would_thank: 0,
      markReminded: false,
      markThanked: false,
    };

    if (!isSlotEnabled(params.campaign.communication_templates, "reminder")) {
      return {
        ...zero,
        detail: {
          ...params.baseDetail,
          action: "skipped_not_donated_no_reminder_template",
        },
      };
    }

    if (
      !params.force &&
      params.pledge.last_reminder_period_key === params.periodKey
    ) {
      return {
        ...zero,
        skipped_already_reminded: 1,
        detail: {
          ...params.baseDetail,
          action: "skipped_already_reminded",
        },
      };
    }

    const channels = this.resolveChannels(params.pledge, params.donor);
    if (!channels.length) {
      return {
        ...zero,
        skipped_no_contact: 1,
        detail: { ...params.baseDetail, action: "skipped_no_contact" },
      };
    }

    if (params.dryRun) {
      return {
        ...zero,
        would_send: 1,
        detail: {
          ...params.baseDetail,
          action: "would_send_reminder",
          channels,
        },
      };
    }

    const sendResult = await this.sendSlotMessages({
      pledge: params.pledge,
      campaign: params.campaign,
      donorId: params.pledge.donor_id,
      slot: "reminder",
      channels,
      periodKey: params.periodKey,
      purposeFallbackCache: params.purposeFallbackCache,
    });

    if (sendResult.sent > 0) {
      return {
        ...zero,
        reminders_sent: 1,
        markReminded: true,
        reminders_failed: sendResult.failed > 0 ? 1 : 0,
        detail: {
          ...params.baseDetail,
          action: "reminder_sent",
          channels,
          error: sendResult.errors.join("; ") || undefined,
        },
      };
    }

    return {
      ...zero,
      reminders_failed: 1,
      detail: {
        ...params.baseDetail,
        action: "reminder_failed",
        channels,
        error: sendResult.errors.join("; ") || "Send failed",
      },
    };
  }

  private resolveChannels(
    pledge: ManualRecurringPledge,
    donor: ManualRecurringPledge["donor"],
  ): ("email" | "whatsapp")[] {
    const channels: ("email" | "whatsapp")[] = [];
    if (pledge.remind_via_email && donor?.email) channels.push("email");
    if (pledge.remind_via_whatsapp && donor?.phone) channels.push("whatsapp");
    return channels;
  }

  private async sendSlotMessages(params: {
    pledge: ManualRecurringPledge;
    campaign: Campaign;
    donorId: number;
    slot: CampaignTemplateSlot;
    channels: ("email" | "whatsapp")[];
    periodKey: string;
    purposeFallbackCache: Map<string, number | null>;
  }): Promise<{ sent: number; failed: number; errors: string[] }> {
    const overrides = await this.buildTemplateOverrides(
      params.pledge,
      params.campaign,
      params.periodKey,
    );
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const channel of params.channels) {
      const templateId = await this.resolveTemplateId(
        params.campaign,
        params.slot,
        channel,
        params.purposeFallbackCache,
      );
      if (!templateId) {
        errors.push(`No ${params.slot} ${channel} template on campaign`);
        failed += 1;
        continue;
      }

      const sendResult = await this.emailTemplateService.sendAutomatedToDonor({
        templateId,
        donorId: params.donorId,
        channel,
        overrides,
        metadata: {
          automated: true,
          job: "recurring_campaign_monthly",
          slot: params.slot,
          period_key: params.periodKey,
          pledge_id: params.pledge.id,
          campaign_id: params.campaign.id,
        },
      });

      if (sendResult.success) sent += 1;
      else {
        failed += 1;
        if (sendResult.error) errors.push(sendResult.error);
      }
    }

    return { sent, failed, errors };
  }

  private hasDonatedForCampaign(
    campaignId: number,
    donorId: number,
    donatedLookup: Map<number, Set<number>>,
  ): boolean {
    return donatedLookup.get(campaignId)?.has(donorId) ?? false;
  }

  private async buildDonatedLookupForChunk(
    pledges: ManualRecurringPledge[],
    start: Date,
    end: Date,
  ): Promise<Map<number, Set<number>>> {
    const lookup = new Map<number, Set<number>>();
    const byCampaign = new Map<number, { campaign: Campaign; donorIds: number[] }>();

    for (const pledge of pledges) {
      if (!pledge.campaign) continue;
      const entry = byCampaign.get(pledge.campaign_id) || {
        campaign: pledge.campaign,
        donorIds: [],
      };
      entry.donorIds.push(pledge.donor_id);
      byCampaign.set(pledge.campaign_id, entry);
    }

    for (const [campaignId, { campaign, donorIds }] of byCampaign) {
      const uniqueIds = [...new Set(donorIds)];
      lookup.set(
        campaignId,
        await this.getDonorIdsWithDonationForCampaign(
          uniqueIds,
          campaign,
          start,
          end,
        ),
      );
    }

    return lookup;
  }

  private async getDonorIdsWithDonationForCampaign(
    donorIds: number[],
    campaign: Campaign,
    start: Date,
    end: Date,
  ): Promise<Set<number>> {
    if (!donorIds.length) return new Set();

    const qb = this.donationRepo
      .createQueryBuilder("d")
      .select("DISTINCT d.donor_id", "donor_id")
      .where("d.donor_id IN (:...donorIds)", { donorIds })
      .andWhere("d.status IN (:...statuses)", {
        statuses: ["paid", "completed"],
      })
      .andWhere("d.date BETWEEN :start AND :end", { start, end });

    if (campaign.project_id != null) {
      qb.andWhere(
        "(d.campaign_id = :campaignId OR d.project_id = :projectId)",
        {
          campaignId: campaign.id,
          projectId: String(campaign.project_id),
        },
      );
    } else {
      qb.andWhere("d.campaign_id = :campaignId", { campaignId: campaign.id });
    }

    const rows = await qb.getRawMany();
    return new Set(rows.map((r) => Number(r.donor_id)).filter(Boolean));
  }

  private async getStripeAutoDonorIds(): Promise<Set<number>> {
    const rows = await this.stripeRecurringRepo
      .createQueryBuilder("rd")
      .select("DISTINCT rd.donor_id", "donor_id")
      .where("rd.record_type = :type", { type: "subscription" })
      .andWhere("rd.stripe_subscription_id IS NOT NULL")
      .andWhere("rd.status IN (:...statuses)", {
        statuses: ["active", "past_due", "trialing"],
      })
      .andWhere("rd.is_archived = false")
      .andWhere("rd.donor_id IS NOT NULL")
      .getRawMany();

    return new Set(rows.map((r) => Number(r.donor_id)).filter(Boolean));
  }

  private async resolveTemplateId(
    campaign: Campaign,
    slot: CampaignTemplateSlot,
    channel: "email" | "whatsapp",
    cache: Map<string, number | null>,
  ): Promise<number | null> {
    const fromCampaign = getSlotTemplateId(
      campaign.communication_templates,
      slot,
      channel,
    );
    if (fromCampaign) return fromCampaign;

    const cacheKey = `${slot}:${channel}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    const purpose = SLOT_TO_TEMPLATE_PURPOSE[slot];
    const fallback =
      await this.emailTemplateService.findDefaultByPurposeAndChannel(
        purpose,
        channel,
      );
    const id = fallback?.id ?? null;
    cache.set(cacheKey, id);
    return id;
  }

  private async buildTemplateOverrides(
    pledge: ManualRecurringPledge,
    campaign: Campaign,
    periodKey: string,
  ): Promise<Record<string, string | number | null>> {
    const itemsSummary = formatPledgeItemsSummary(pledge.lines || []);
    const prepaidCoverage = formatPrepaidCoverageLabel(
      pledge.prepaid_start_period_key,
      pledge.prepaid_end_period_key,
    );

    return {
      amount:
        pledge.pledged_amount != null ? String(pledge.pledged_amount) : "",
      expected_amount:
        pledge.pledged_amount != null ? String(pledge.pledged_amount) : "",
      items_summary: itemsSummary,
      pledge_mode: pledge.pledge_mode || "",
      prepaid_coverage: prepaidCoverage,
      prepaid_months:
        pledge.prepaid_months != null ? String(pledge.prepaid_months) : "",
      current_month: formatPeriodKeyLabel(periodKey),
      campaign_name: campaign.title,
    };
  }
}
