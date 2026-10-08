import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { RecurringDonation } from "./entities/recurring-donation.entity";
import { RecurringDonationAttachment } from "./entities/recurring-donation-attachment.entity";
import { AddRecurringDonationAttachmentDto } from "./dto/add-recurring-donation-attachment.dto";
import { Donation } from "../entities/donation.entity";
import { Donor } from "src/dms/donor/entities/donor.entity";
import { EmailService } from "../../email/email.service";
import { WhatsAppService } from "../../utils/services/whatsapp.service";
import { DonationsService } from "../donations.service";
import { PermissionsService } from "../../permissions/permissions.service";
import { assertRecurringReconciler } from "../../permissions/reconciler-permissions";
import {
  billingIntervalToFrequency,
  getPeriodKeyForFrequency,
  listPeriodKeysBetween,
} from "src/dms/manual_recurring/utils/manual-recurring-period.util";
import { CampaignTargetFrequency } from "src/dms/campaigns/utils/campaign-recurring.constants";
import {
  MAX_UNPAID_PAYMENT_REMINDERS_BEFORE_DISABLE,
  RECURRING_SUBSCRIPTION_DISABLED_REASON,
  RECURRING_SUBSCRIPTION_DISABLED_STATUS,
} from "./recurring-donations.constants";
import {
  isSubscriptionPrepaidPeriodCovered,
  listPrepaidPeriodKeysInRange,
  prepaidInstallmentInvoiceKey,
  resolvePrepaidPeriodCount,
  resolveSubscriptionPrepaidPeriodKeys,
} from "./recurring-prepaid.util";
import { resolveRecurringStartDateForStorage } from "./recurring-billing-date.util";
import { resolveRecurringReferrerUserId } from "./recurring-referrer.util";
import { User } from "src/users/user.entity";
import {
  LOOKUP_PROFILES,
  listEntityLookup,
  type EntityLookupParams,
  type LookupOption,
} from "../../utils/lookup";

const SORTABLE_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "status",
  "amount",
  "paid_at",
  "billing_interval",
]);

@Injectable()
export class RecurringDonationsLedgerService {
  private readonly logger = new Logger(RecurringDonationsLedgerService.name);

  /** Effective referrer for list queries (aliases: rd, d = initial donation, donor). */
  private static readonly REFERRER_ID_SQL =
    `COALESCE(rd.referred_by, d.referred_by, donor.referred_by)`;

  constructor(
    @InjectRepository(RecurringDonation)
    private readonly recurringDonationRepo: Repository<RecurringDonation>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(Donor)
    private readonly donorRepository: Repository<Donor>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RecurringDonationAttachment)
    private readonly recurringDonationAttachmentRepo: Repository<RecurringDonationAttachment>,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly moduleRef: ModuleRef,
    private readonly permissionsService: PermissionsService,
  ) {}

  async search(payload: Record<string, any>, user?: { id?: number } | null) {
    const pagination = payload.pagination || {};
    const page = Math.max(1, Number(pagination.page) || 1);
    let pageSize = Number(pagination.pageSize);
    if (!Number.isFinite(pageSize)) pageSize = 10;
    if (pagination.pageSize === 0) pageSize = 0;

    const sortField = SORTABLE_FIELDS.has(pagination.sortField)
      ? pagination.sortField
      : "created_at";
    const sortOrder =
      String(pagination.sortOrder || "DESC").toUpperCase() === "ASC"
        ? "ASC"
        : "DESC";

    const filters = payload.filters || payload;

    const qb = this.recurringDonationRepo
      .createQueryBuilder("rd")
      .leftJoin(Donation, "d", "d.id = rd.initial_donation_id")
      .leftJoin(Donor, "donor", "donor.id = rd.donor_id")
      .leftJoin(
        User,
        "ref_user",
        `ref_user.id = ${RecurringDonationsLedgerService.REFERRER_ID_SQL}`,
      )
      .where("rd.record_type = :recordType", { recordType: "subscription" })
      .andWhere("rd.is_archived = false");

    // Referrer: subscription.referred_by → initial donation → donor (legacy rows)
    const referrerUserIdRaw = filters.referrer_user_id;
    const referrerFilterAny =
      String(filters.referrer_any || "").toLowerCase() === "true" ||
      ["any", "all", "__all__"].includes(
        String(referrerUserIdRaw || "").trim().toLowerCase(),
      );
    const parseReferrerIds = (raw: unknown): number[] => {
      if (Array.isArray(raw)) {
        return raw
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0);
      }
      if (raw == null || raw === "") return [];
      return String(raw)
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    };
    let referrerUserIds = parseReferrerIds(filters.referrer_user_ids);
    if (!referrerUserIds.length && referrerUserIdRaw != null && referrerUserIdRaw !== "") {
      const token = String(referrerUserIdRaw).trim().toLowerCase();
      if (token === "me" && Number(user?.id) > 0) {
        referrerUserIds = [Number(user!.id)];
      } else if (!["any", "all", "__all__", "me"].includes(token)) {
        referrerUserIds = parseReferrerIds(referrerUserIdRaw);
      }
    }
    if (referrerFilterAny) {
      qb.andWhere(`${RecurringDonationsLedgerService.REFERRER_ID_SQL} IS NOT NULL`);
    } else if (referrerUserIds.length > 0) {
      qb.andWhere(
        `${RecurringDonationsLedgerService.REFERRER_ID_SQL} IN (:...referrerUserIds)`,
        { referrerUserIds },
      );
    }

    if (filters.status) {
      qb.andWhere("rd.status = :status", { status: filters.status });
    }
    if (filters.billing_interval) {
      qb.andWhere("rd.billing_interval = :billingInterval", {
        billingInterval: filters.billing_interval,
      });
    }
    // Online = Stripe / website; Offline = staff/manual (no website/stripe signal)
    const sourceFilter = String(filters.source || "")
      .trim()
      .toLowerCase();
    const isOnlineSql = `(
      rd.stripe_subscription_id IS NOT NULL
      OR LOWER(COALESCE(rd.donation_method, '')) IN ('online', 'stripe', 'stripe_embed')
      OR LOWER(COALESCE(d.donation_source, '')) = 'website'
      OR LOWER(COALESCE(donor.source, '')) = 'website'
    )`;
    if (sourceFilter === "online") {
      qb.andWhere(isOnlineSql);
    } else if (sourceFilter === "offline") {
      qb.andWhere(`NOT ${isOnlineSql}`);
    }
    if (filters.donor_id) {
      qb.andWhere("rd.donor_id = :donorId", {
        donorId: Number(filters.donor_id),
      });
    }
    if (filters.search) {
      const term = `%${String(filters.search).trim()}%`;
      qb.andWhere(
        `(rd.stripe_subscription_id ILIKE :term OR d."orderId" ILIKE :term OR donor.email ILIKE :term OR donor.name ILIKE :term OR donor.first_name ILIKE :term OR donor.last_name ILIKE :term)`,
        { term },
      );
    }

    // Date filters:
    // - With Installments / Paid / Pending DD → dates apply to installment due date
    // - Otherwise → created_at (same keys as donations listing)
    const exactDate = String(filters.date || "").trim();
    const rangeStart = String(filters.start_date || "").trim();
    const rangeEnd = String(filters.end_date || "").trim();
    const installmentStatus = String(filters.installment_status || "")
      .trim()
      .toLowerCase();
    const datewiseInstallmentModes = new Set([
      "installments",
      "paid_installments",
      "pending_installments",
    ]);
    const isDatewiseInstallmentFilter =
      datewiseInstallmentModes.has(installmentStatus);

    if (!isDatewiseInstallmentFilter) {
      if (rangeStart && rangeEnd) {
        qb.andWhere(`DATE(rd.created_at) BETWEEN :rangeStart AND :rangeEnd`, {
          rangeStart,
          rangeEnd,
        });
      } else if (rangeStart) {
        qb.andWhere(`DATE(rd.created_at) >= :rangeStart`, { rangeStart });
      } else if (rangeEnd) {
        qb.andWhere(`DATE(rd.created_at) <= :rangeEnd`, { rangeEnd });
      } else if (exactDate) {
        qb.andWhere(`DATE(rd.created_at) = :exactDate`, { exactDate });
      }
    }

    // Payment / installment collection filters (subscription list):
    // Datewise (with Date / Date Range):
    // - installments: any installment due on selected date(s)
    // - paid_installments: paid/completed for that date
    // - pending_installments: pending for that date
    // Legacy (no datewise meaning):
    // - pending / pending_dues / pending_initial / completed
    const hasCompletedInstallmentSql = `EXISTS (
      SELECT 1 FROM recurring_donations inst
      WHERE inst.parent_id = rd.id
        AND inst.record_type = 'installment'
        AND inst.is_archived = false
        AND LOWER(COALESCE(inst.status, '')) IN ('completed', 'paid', 'success')
    )`;
    const hasPendingDueSql = `EXISTS (
      SELECT 1 FROM recurring_donations inst
      WHERE inst.parent_id = rd.id
        AND inst.record_type = 'installment'
        AND inst.is_archived = false
        AND LOWER(COALESCE(inst.status, '')) = 'pending'
    )`;

    if (isDatewiseInstallmentFilter) {
      const statusSql =
        installmentStatus === "paid_installments"
          ? `AND LOWER(COALESCE(inst.status, '')) IN ('completed', 'paid', 'success')`
          : installmentStatus === "pending_installments"
            ? `AND LOWER(COALESCE(inst.status, '')) = 'pending'`
            : "";

      // Reconstruct installment due date from period_key + subscription billing day
      const installmentDueDateSql = `CASE
        WHEN inst.period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN inst.period_key::date
        WHEN inst.period_key ~ '^[0-9]{4}-[0-9]{2}$' THEN make_date(
          split_part(inst.period_key, '-', 1)::int,
          split_part(inst.period_key, '-', 2)::int,
          LEAST(
            COALESCE(
              EXTRACT(DAY FROM rd.start_date::timestamp)::int,
              EXTRACT(DAY FROM rd.created_at)::int,
              1
            ),
            EXTRACT(DAY FROM (
              date_trunc('month', to_date(inst.period_key || '-01', 'YYYY-MM-DD'))
              + interval '1 month - 1 day'
            ))::int
          )
        )
        WHEN inst.period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN split_part(inst.period_key, '_', 1)::date
        ELSE DATE(COALESCE(inst.paid_at, inst.created_at))
      END`;

      const isWeeklyKeySql = `inst.period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}-[0-9]{2}-[0-9]{2}$'`;
      const weekStartSql = `split_part(inst.period_key, '_', 1)::date`;
      const weekEndSql = `split_part(inst.period_key, '_', 2)::date`;

      let dateMatchSql = "TRUE";
      const dateParams: Record<string, string> = {};

      if (rangeStart && rangeEnd) {
        dateMatchSql = `(
          (${installmentDueDateSql}) BETWEEN :instDateStart::date AND :instDateEnd::date
          OR (
            ${isWeeklyKeySql}
            AND ${weekStartSql} <= :instDateEnd::date
            AND ${weekEndSql} >= :instDateStart::date
          )
        )`;
        dateParams.instDateStart = rangeStart;
        dateParams.instDateEnd = rangeEnd;
      } else if (rangeStart) {
        dateMatchSql = `(
          (${installmentDueDateSql}) >= :instDateStart::date
          OR (
            ${isWeeklyKeySql}
            AND ${weekEndSql} >= :instDateStart::date
          )
        )`;
        dateParams.instDateStart = rangeStart;
      } else if (rangeEnd) {
        dateMatchSql = `(
          (${installmentDueDateSql}) <= :instDateEnd::date
          OR (
            ${isWeeklyKeySql}
            AND ${weekStartSql} <= :instDateEnd::date
          )
        )`;
        dateParams.instDateEnd = rangeEnd;
      } else if (exactDate) {
        dateMatchSql = `(
          (${installmentDueDateSql}) = :instDateExact::date
          OR (
            ${isWeeklyKeySql}
            AND :instDateExact::date BETWEEN ${weekStartSql} AND ${weekEndSql}
          )
        )`;
        dateParams.instDateExact = exactDate;
      }

      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM recurring_donations inst
          WHERE inst.parent_id = rd.id
            AND inst.record_type = 'installment'
            AND inst.is_archived = false
            ${statusSql}
            AND (${dateMatchSql})
        )`,
        dateParams,
      );
    } else if (
      installmentStatus === "pending_dues" ||
      installmentStatus === "arrears"
    ) {
      qb.andWhere(hasPendingDueSql);
    } else if (installmentStatus === "pending") {
      qb.andWhere(`(NOT ${hasCompletedInstallmentSql} OR ${hasPendingDueSql})`);
    } else if (installmentStatus === "pending_initial") {
      qb.andWhere("rd.initial_donation_id IS NOT NULL");
      qb.andWhere(
        "LOWER(COALESCE(d.status, '')) IN (:...pendingDonationStatuses)",
        {
          pendingDonationStatuses: ["pending", "failed"],
        },
      );
    } else if (installmentStatus === "completed") {
      qb.andWhere(hasCompletedInstallmentSql);
    }

    const total = await qb.clone().getCount();

    qb.select([
      "rd.id AS id",
      "rd.initial_donation_id AS initial_donation_id",
      "rd.donor_id AS donor_id",
      "rd.stripe_subscription_id AS stripe_subscription_id",
      "rd.stripe_customer_id AS stripe_customer_id",
      "rd.billing_interval AS billing_interval",
      "rd.billing_interval_count AS billing_interval_count",
      "rd.start_date_mode AS start_date_mode",
      "rd.start_date AS start_date",
      "rd.consent AS consent",
      "rd.consent_at AS consent_at",
      "rd.amount AS amount",
      "rd.total_amount AS total_amount",
      "rd.currency AS currency",
      "rd.status AS status",
      "rd.donation_method AS donation_method",
      "rd.project_id AS project_id",
      "rd.campaign_id AS campaign_id",
      "rd.donation_type AS donation_type",
      "rd.prepaid_months AS prepaid_months",
      "rd.prepaid_periods AS prepaid_periods",
      "rd.prepaid_start_period_key AS prepaid_start_period_key",
      "rd.prepaid_end_period_key AS prepaid_end_period_key",
      "rd.paid_at AS paid_at",
      "rd.created_at AS created_at",
      "rd.updated_at AS updated_at",
      'd."orderId" AS initial_order_id',
      "d.status AS initial_donation_status",
      "donor.name AS donor_name",
      "donor.email AS donor_email",
      "ref_user.id AS referrer_user_id",
      "ref_user.first_name AS referrer_first_name",
      "ref_user.last_name AS referrer_last_name",
      "ref_user.email AS referrer_email",
      "ref_user.referral_code AS referrer_code",
    ])
      .addSelect(
        `(SELECT COUNT(*)::int FROM recurring_donations inst WHERE inst.parent_id = rd.id AND inst.record_type = 'installment' AND inst.is_archived = false)`,
        "installment_count",
      )
      .addSelect(
        `(SELECT COUNT(*)::int FROM recurring_donations inst WHERE inst.parent_id = rd.id AND inst.record_type = 'installment' AND inst.is_archived = false AND LOWER(COALESCE(inst.status, '')) IN ('completed', 'paid', 'success'))`,
        "completed_installment_count",
      )
      .addSelect(
        `(SELECT COUNT(*)::int FROM recurring_donations inst WHERE inst.parent_id = rd.id AND inst.record_type = 'installment' AND inst.is_archived = false AND LOWER(COALESCE(inst.status, '')) = 'pending')`,
        "pending_installment_count",
      )
      .orderBy(`rd.${sortField}`, sortOrder);

    if (pageSize > 0) {
      qb.offset((page - 1) * pageSize).limit(pageSize);
    }

    const rows = await qb.getRawMany();

    const totalPages =
      pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async findOne(id: number) {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id,
        record_type: "subscription",
        is_archived: false,
      },
      relations: ["created_by"],
    });

    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }

    // Ensure current period due exists for non-Stripe (does not create donations)
    if (!subscription.stripe_subscription_id) {
      await this.ensurePeriodDuesForSubscription(subscription);
    }

    const referrerUserId =
      subscription.referred_by ??
      (await resolveRecurringReferrerUserId(this.donationRepository, {
        donationId: subscription.initial_donation_id,
        donorId: subscription.donor_id,
      }));

    const [installments, initialDonation, donor, referrer] = await Promise.all([
      this.recurringDonationRepo.find({
        where: {
          parent_id: id,
          record_type: "installment",
          is_archived: false,
        },
        relations: ["created_by"],
        order: { period_key: "ASC", created_at: "ASC", id: "ASC" },
      }),
      subscription.initial_donation_id
        ? this.donationRepository.findOne({
            where: { id: subscription.initial_donation_id },
            select: [
              "id",
              "orderId",
              "amount",
              "currency",
              "status",
              "donation_method",
              "created_at",
            ],
          })
        : null,
      subscription.donor_id
        ? this.donorRepository.findOne({
            where: { id: subscription.donor_id },
            select: ["id", "name", "first_name", "last_name", "email", "phone"],
          })
        : null,
      referrerUserId
        ? this.userRepository.findOne({
            where: { id: referrerUserId },
            select: ["id", "first_name", "last_name", "email", "referral_code"],
          })
        : null,
    ]);

    const completed = installments.filter((row) =>
      ["completed", "paid", "success"].includes(
        String(row.status || "").toLowerCase(),
      ),
    );
    const pending = installments.filter(
      (row) => String(row.status || "").toLowerCase() === "pending",
    );
    const totalPaid = completed.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0,
    );
    const arrearsAmount = pending.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0,
    );

    const pickActor = (user: any) => {
      if (!user || typeof user !== "object") return null;
      return {
        id: user.id,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        email: user.email || null,
      };
    };

    const attachmentMap = await this.loadAttachmentsGroupedByRecurringId([
      id,
      ...installments.map((row) => row.id),
    ]);

    const mapAttachment = (attachment: RecurringDonationAttachment) => ({
      id: attachment.id,
      file_name: attachment.file_name,
      file_url: attachment.file_url,
      file_type: attachment.file_type,
      description: attachment.description,
      created_at: attachment.created_at,
      uploaded_by: pickActor(attachment.uploaded_by),
    });

    return {
      subscription: {
        ...subscription,
        created_by: pickActor(subscription.created_by),
        attachments: (attachmentMap.get(id) || []).map(mapAttachment),
      },
      installments: installments.map((row) => ({
        ...row,
        created_by: pickActor(row.created_by),
        attachments: (attachmentMap.get(row.id) || []).map(mapAttachment),
      })),
      initial_donation: initialDonation,
      donor,
      referred_by: referrer
        ? {
            id: referrer.id,
            first_name: referrer.first_name || null,
            last_name: referrer.last_name || null,
            email: referrer.email || null,
            referral_code: referrer.referral_code || null,
          }
        : null,
      summary: {
        installment_count: installments.length,
        completed_installment_count: completed.length,
        pending_installment_count: pending.length,
        total_paid_amount: totalPaid,
        arrears_amount: arrearsAmount,
      },
    };
  }

  /**
   * Staff Add: create a non-Stripe subscription row on the Recurring Donations ledger.
   * Stripe subscriptions continue to be created only via checkout/webhooks.
   */
  async createStaffSubscription(
    dto: {
      donor_id: number;
      amount: number;
      total_amount?: number | null;
      currency?: string;
      billing_interval: "day" | "week" | "month" | "year";
      billing_interval_count?: number;
      start_date_mode?: string | null;
      start_date?: string | null;
      consent?: boolean | null;
      donation_method?: string | null;
      project_id?: string | null;
      campaign_id?: number | null;
      donation_type?: string | null;
      on_behalf_names?: string | null;
      prepaid_periods?: number | null;
      initial_donation_id?: number | null;
      status?: string;
      installment_status?: string;
    },
    userId?: number | null,
  ): Promise<RecurringDonation> {
    const donorId = Number(dto.donor_id);
    if (!Number.isFinite(donorId) || donorId <= 0) {
      throw new BadRequestException("donor_id is required");
    }
    const donor = await this.donorRepository.findOne({
      where: { id: donorId, is_archived: false },
    });
    if (!donor) {
      throw new BadRequestException("Donor not found");
    }

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("amount must be greater than 0");
    }

    const interval = String(dto.billing_interval || "").toLowerCase() as
      | "day"
      | "week"
      | "month"
      | "year";
    if (!["day", "week", "month", "year"].includes(interval)) {
      throw new BadRequestException("Invalid billing_interval");
    }

    let initialDonationId: number | null = null;
    if (dto.initial_donation_id != null && dto.initial_donation_id !== undefined) {
      const donationId = Number(dto.initial_donation_id);
      if (!Number.isFinite(donationId) || donationId <= 0) {
        throw new BadRequestException("Invalid initial_donation_id");
      }
      const donation = await this.donationRepository.findOne({
        where: { id: donationId, is_archived: false },
      });
      if (!donation) {
        throw new BadRequestException("Initial donation not found");
      }
      const existingForDonation = await this.recurringDonationRepo.findOne({
        where: {
          initial_donation_id: donationId,
          record_type: "subscription",
          is_archived: false,
        },
      });
      if (existingForDonation) {
        throw new BadRequestException(
          "A recurring subscription already exists for this initial donation",
        );
      }
      initialDonationId = donationId;
    }

    // Empty start mode / start date → same_date + today (PKT)
    const resolvedStart = resolveRecurringStartDateForStorage({
      startDateMode: dto.start_date_mode || "same_date",
      startDate: dto.start_date || null,
    });

    const prepaidCount = this.resolveStaffPrepaidInstallmentCount({
      prepaid_periods: dto.prepaid_periods,
      billing_interval_count: dto.billing_interval_count,
    });
    const startRef = resolvedStart.startDate
      ? new Date(`${resolvedStart.startDate}T12:00:00`)
      : new Date();
    const prepaid = resolveSubscriptionPrepaidPeriodKeys(
      prepaidCount,
      interval === "year" ? "month" : interval,
      Number.isNaN(startRef.getTime()) ? new Date() : startRef,
    );

    // amount = installment amount; total_amount optional (staff prepaid only)
    const totalAmountRaw =
      dto.total_amount != null && dto.total_amount !== undefined
        ? Number(dto.total_amount)
        : NaN;
    let totalAmount: number | null = null;
    if (Number.isFinite(totalAmountRaw) && totalAmountRaw > 0) {
      totalAmount = Math.round(totalAmountRaw);
    } else if (prepaid.prepaidPeriods && prepaid.prepaidPeriods >= 2) {
      totalAmount = Math.round(amount * prepaid.prepaidPeriods);
    }

    const referredBy = await resolveRecurringReferrerUserId(
      this.donationRepository,
      { donationId: initialDonationId, donorId },
    );

    const row = this.recurringDonationRepo.create({
      record_type: "subscription",
      parent_id: null,
      initial_donation_id: initialDonationId,
      donor_id: donorId,
      referred_by: referredBy,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      billing_interval: interval,
      // Cadence stays every 1 period; prepaid count lives on prepaid_* fields
      billing_interval_count: 1,
      start_date_mode: resolvedStart.startDateMode,
      start_date: resolvedStart.startDate,
      consent: dto.consent ?? true,
      consent_at: dto.consent === false ? null : new Date(),
      amount,
      total_amount: totalAmount,
      currency: (dto.currency || "PKR").toUpperCase(),
      status: dto.status || "active",
      donation_method: dto.donation_method || "manual",
      project_id: dto.project_id || null,
      campaign_id: dto.campaign_id ?? null,
      donation_type: dto.donation_type || null,
      on_behalf_names: dto.on_behalf_names
        ? String(dto.on_behalf_names).trim() || null
        : null,
      prepaid_months: prepaid.prepaidMonths,
      prepaid_periods: prepaid.prepaidPeriods,
      prepaid_start_period_key: prepaid.start,
      prepaid_end_period_key: prepaid.end,
      ...(userId && userId > 0
        ? { created_by: { id: userId } as any, updated_by: { id: userId } as any }
        : {}),
    });

    const saved = await this.recurringDonationRepo.save(row);

    // Staff-created ledger subscription ⇒ mark donor as recurring (if not already)
    const donorPatch: Record<string, unknown> = { recurring: true };
    const consented = dto.consent !== false;
    if (consented) {
      donorPatch.recurring_consent = true;
      if (!donor.recurring_consent_at) {
        donorPatch.recurring_consent_at = new Date();
      }
    }
    await this.donorRepository.update(donorId, donorPatch);

    if (prepaid.prepaidPeriods && prepaid.prepaidPeriods >= 2) {
      // Lump-sum paid for N periods → N completed installments; reminders skipped
      await this.ensureStaffPrepaidPaidInstallments(saved, {
        totalAmount: totalAmount ?? amount * prepaid.prepaidPeriods,
        userId,
      });
      const refreshed = await this.recurringDonationRepo.findOne({
        where: { id: saved.id },
      });
      if (refreshed) {
        await this.sendThanksForCompletedStaffInstallment(refreshed);
        return refreshed;
      }
      return saved;
    }

    // Auto-create first installment (subscription row stays record_type=subscription)
    await this.createFirstInstallmentForStaffSubscription(
      saved,
      dto.installment_status,
      userId,
    );

    return saved;
  }

  /**
   * Staff form: Interval count > 1 (or prepaid_periods) = number of prepaid paid installments.
   * Amount on the form is the TOTAL paid; each installment = total ÷ count.
   */
  private resolveStaffPrepaidInstallmentCount(params: {
    prepaid_periods?: number | null;
    billing_interval_count?: number | null;
  }): number | null {
    const fromPrepaid = Number(params.prepaid_periods);
    if (Number.isFinite(fromPrepaid) && fromPrepaid >= 2) {
      return Math.min(36, Math.floor(fromPrepaid));
    }
    const fromInterval = Number(params.billing_interval_count);
    if (Number.isFinite(fromInterval) && fromInterval >= 2) {
      return Math.min(36, Math.floor(fromInterval));
    }
    return null;
  }

  /** Split total across N periods (remainder on the last period). */
  private splitTotalAcrossPeriods(
    totalAmount: number,
    periods: number,
  ): { base: number; amounts: number[] } {
    const n = Math.max(1, Math.floor(Number(periods) || 1));
    const total = Math.round(Number(totalAmount) || 0);
    const base = Math.floor(total / n);
    const remainder = total - base * n;
    const amounts = Array.from({ length: n }, (_, i) =>
      i === n - 1 ? base + remainder : base,
    );
    return { base, amounts };
  }

  /**
   * Create/complete prepaid installments for staff subscriptions.
   * Never deletes or archives existing installment rows.
   */
  private async ensureStaffPrepaidPaidInstallments(
    subscription: RecurringDonation,
    options?: { totalAmount?: number | null; userId?: number | null },
  ): Promise<{ created: number; completed: number }> {
    if (!subscription?.id || subscription.stripe_subscription_id) {
      return { created: 0, completed: 0 };
    }

    const prepaidCount = resolvePrepaidPeriodCount({
      prepaid_periods: subscription.prepaid_periods,
      prepaid_months: subscription.prepaid_months,
    });
    if (!prepaidCount || prepaidCount < 2) {
      return { created: 0, completed: 0 };
    }

    let startKey = subscription.prepaid_start_period_key;
    let endKey = subscription.prepaid_end_period_key;
    if (!startKey || !endKey) {
      const startRef = subscription.start_date
        ? new Date(`${subscription.start_date}T12:00:00`)
        : new Date();
      const prepaid = resolveSubscriptionPrepaidPeriodKeys(
        prepaidCount,
        subscription.billing_interval === "year"
          ? "month"
          : subscription.billing_interval || "month",
        Number.isNaN(startRef.getTime()) ? new Date() : startRef,
      );
      startKey = prepaid.start;
      endKey = prepaid.end;
      await this.recurringDonationRepo.update(subscription.id, {
        prepaid_periods: prepaid.prepaidPeriods,
        prepaid_months: prepaid.prepaidMonths,
        prepaid_start_period_key: prepaid.start,
        prepaid_end_period_key: prepaid.end,
        billing_interval_count: 1,
      });
      subscription.prepaid_periods = prepaid.prepaidPeriods;
      subscription.prepaid_months = prepaid.prepaidMonths;
      subscription.prepaid_start_period_key = prepaid.start;
      subscription.prepaid_end_period_key = prepaid.end;
    }

    const periodKeys = listPrepaidPeriodKeysInRange(
      startKey!,
      endKey!,
      subscription.billing_interval || "month",
    );
    if (!periodKeys.length) {
      return { created: 0, completed: 0 };
    }

    const installmentAmount = Math.round(Number(subscription.amount) || 0);
    const totalRaw = Number(options?.totalAmount);
    const totalAmount =
      Number.isFinite(totalRaw) && totalRaw > 0
        ? Math.round(totalRaw)
        : Number(subscription.total_amount) > 0
          ? Math.round(Number(subscription.total_amount))
          : installmentAmount * periodKeys.length;

    // Keep amount = installment; persist total_amount for staff prepaid
    await this.recurringDonationRepo.update(subscription.id, {
      billing_interval_count: 1,
      total_amount: totalAmount > 0 ? totalAmount : null,
    });
    subscription.total_amount = totalAmount > 0 ? totalAmount : null;

    const paidAt = new Date();
    const currency = subscription.currency || "PKR";
    let created = 0;
    let completed = 0;

    for (let i = 0; i < periodKeys.length; i++) {
      const periodKey = periodKeys[i];
      const periodAmount = installmentAmount;
      const invoiceKey = `staff-prepaid-${subscription.id}-${String(periodKey).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      const existing = await this.recurringDonationRepo.findOne({
        where: {
          parent_id: subscription.id,
          record_type: "installment",
          period_key: periodKey,
          is_archived: false,
        },
      });

      if (existing) {
        const st = String(existing.status || "").toLowerCase();
        if (["completed", "paid", "success"].includes(st)) {
          // Preserve existing paid row — do not overwrite amount/status
          continue;
        }
        await this.recurringDonationRepo.update(existing.id, {
          amount: periodAmount,
          currency,
          status: "completed",
          paid_at: existing.paid_at || paidAt,
          stripe_billing_reason:
            existing.stripe_billing_reason || "staff_prepaid_period",
          stripe_invoice_id: existing.stripe_invoice_id || invoiceKey,
          ...(options?.userId && options.userId > 0
            ? { updated_by: { id: options.userId } as any }
            : {}),
        });
        completed += 1;
        continue;
      }

      await this.recurringDonationRepo.save(
        this.recurringDonationRepo.create({
          record_type: "installment",
          parent_id: subscription.id,
          initial_donation_id: subscription.initial_donation_id,
          donor_id: subscription.donor_id,
          stripe_subscription_id: null,
          stripe_invoice_id: invoiceKey,
          billing_interval: subscription.billing_interval,
          billing_interval_count: 1,
          amount: periodAmount,
          currency,
          status: "completed",
          donation_method: subscription.donation_method,
          project_id: subscription.project_id,
          campaign_id: subscription.campaign_id,
          donation_type: subscription.donation_type,
          paid_at: paidAt,
          period_key: periodKey,
          stripe_billing_reason: "staff_prepaid_period",
          ...(options?.userId && options.userId > 0
            ? {
                created_by: { id: options.userId } as any,
                updated_by: { id: options.userId } as any,
              }
            : {}),
        }),
      );
      created += 1;
    }

    return { created, completed };
  }

  /**
   * Ensures the current-period installment exists, then applies staff-chosen status.
   * When installment_status is completed, donor gets thanks WhatsApp + email.
   */
  private async createFirstInstallmentForStaffSubscription(
    subscription: RecurringDonation,
    installmentStatusRaw?: string | null,
    userId?: number | null,
  ): Promise<void> {
    if (!subscription?.id || subscription.stripe_subscription_id) return;

    await this.ensurePeriodDuesForSubscription(subscription);

    const statusRaw = String(installmentStatusRaw || "pending")
      .trim()
      .toLowerCase();
    const installmentStatus = ["pending", "completed", "failed"].includes(
      statusRaw,
    )
      ? statusRaw
      : "pending";

    await assertRecurringReconciler(
      this.permissionsService,
      { id: userId },
      installmentStatus,
    );

    let first = await this.recurringDonationRepo.findOne({
      where: {
        parent_id: subscription.id,
        record_type: "installment",
        is_archived: false,
      },
      order: { id: "ASC" },
    });

    if (!first) {
      const frequency = billingIntervalToFrequency(
        subscription.billing_interval,
      );
      const periodKey = frequency
        ? getPeriodKeyForFrequency(frequency, new Date())
        : null;
      first = await this.recurringDonationRepo.save(
        this.recurringDonationRepo.create({
          record_type: "installment",
          parent_id: subscription.id,
          initial_donation_id: subscription.initial_donation_id,
          donor_id: subscription.donor_id,
          stripe_subscription_id: null,
          stripe_invoice_id: null,
          billing_interval: subscription.billing_interval,
          billing_interval_count: subscription.billing_interval_count,
          amount: subscription.amount,
          currency: subscription.currency || "PKR",
          status: installmentStatus,
          donation_method: subscription.donation_method,
          project_id: subscription.project_id,
          campaign_id: subscription.campaign_id,
          donation_type: subscription.donation_type,
          paid_at: installmentStatus === "completed" ? new Date() : null,
          period_key: periodKey,
          stripe_billing_reason: "period_due",
        }),
      );
    } else if (
      String(first.status || "").toLowerCase() !== installmentStatus
    ) {
      await this.recurringDonationRepo.update(first.id, {
        status: installmentStatus,
        paid_at: installmentStatus === "completed" ? new Date() : null,
      });
    }

    if (installmentStatus === "completed") {
      await this.sendThanksForCompletedStaffInstallment(subscription);
    }
  }

  /** Ensure a completed donation exists, then reuse DonationsService.sendDonationThanksOnce. */
  private async sendThanksForCompletedStaffInstallment(
    subscription: RecurringDonation,
  ): Promise<void> {
    if (!subscription?.donor_id) return;

    let donationId = subscription.initial_donation_id ?? null;
    if (donationId) {
      const existing = await this.donationRepository.findOne({
        where: { id: donationId, is_archived: false },
      });
      if (existing) {
        const st = String(existing.status || "").toLowerCase();
        if (!["completed", "paid", "success"].includes(st)) {
          await this.donationRepository.update(existing.id, {
            status: "completed",
          });
        }
      } else {
        donationId = null;
      }
    }

    if (!donationId) {
      const created = await this.donationRepository.save(
        this.donationRepository.create({
          donor_id: subscription.donor_id,
          campaign_id: subscription.campaign_id ?? null,
          project_id: subscription.project_id ?? null,
          amount: Number(subscription.amount) || 0,
          currency: subscription.currency || "PKR",
          donation_type: subscription.donation_type || "general",
          donation_method: subscription.donation_method || "manual",
          donation_source: "recurring_staff_create",
          status: "completed",
          on_behalf_names: subscription.on_behalf_names || null,
          note: `First installment for subscription #${subscription.id}`,
          manual_recurring_intent: {
            recurring_subscription_id: subscription.id,
            staff_first_installment: true,
          },
        }),
      );
      donationId = created.id;
      await this.recurringDonationRepo.update(subscription.id, {
        initial_donation_id: donationId,
      });
      await this.applySubscriptionReferrerToDonation(subscription, donationId);
    }

    try {
      const donationsService = this.moduleRef.get(DonationsService, {
        strict: false,
      });
      await donationsService.sendDonationThanksOnce(donationId);
    } catch (err: any) {
      this.logger.warn(
        `Staff recurring thanks failed donation=${donationId}: ${err?.message || err}`,
      );
    }
  }

  /**
   * Staff Update: edit ledger subscription fields.
   * Stripe-backed rows: only status may be changed (charges stay in Stripe).
   */
  async updateStaffSubscription(
    id: number,
    dto: {
      donor_id?: number;
      amount?: number;
      total_amount?: number | null;
      currency?: string;
      billing_interval?: "day" | "week" | "month" | "year";
      billing_interval_count?: number;
      start_date_mode?: string | null;
      start_date?: string | null;
      consent?: boolean | null;
      donation_method?: string | null;
      project_id?: string | null;
      campaign_id?: number | null;
      donation_type?: string | null;
      on_behalf_names?: string | null;
      prepaid_periods?: number | null;
      initial_donation_id?: number | null;
      status?: string;
    },
    userId?: number | null,
  ): Promise<RecurringDonation> {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }

    const isStripe = !!subscription.stripe_subscription_id;
    const patch: Partial<RecurringDonation> = {};

    if (isStripe) {
      if (dto.status != null) {
        const status = String(dto.status).toLowerCase();
        if (!["active", "canceled", "past_due", "failed"].includes(status)) {
          throw new BadRequestException("Invalid status");
        }
        patch.status = status;
      }
      const otherKeys = Object.keys(dto).filter((k) => k !== "status");
      if (otherKeys.length > 0 && dto.status == null) {
        throw new BadRequestException(
          "Stripe subscriptions can only update status from this screen",
        );
      }
      if (otherKeys.length > 0 && dto.status != null) {
        // Ignore other fields silently when status is provided with extras
      }
    } else {
      if (dto.donor_id != null) {
        const donorId = Number(dto.donor_id);
        if (!Number.isFinite(donorId) || donorId <= 0) {
          throw new BadRequestException("Invalid donor_id");
        }
        const donor = await this.donorRepository.findOne({
          where: { id: donorId, is_archived: false },
        });
        if (!donor) throw new BadRequestException("Donor not found");
        patch.donor_id = donorId;
      }
      if (dto.amount != null) {
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new BadRequestException("amount must be greater than 0");
        }
        patch.amount = amount;
      }
      if (dto.total_amount !== undefined) {
        if (dto.total_amount == null || dto.total_amount === ("" as any)) {
          patch.total_amount = null;
        } else {
          const totalAmount = Number(dto.total_amount);
          if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            throw new BadRequestException("total_amount must be greater than 0");
          }
          patch.total_amount = Math.round(totalAmount);
        }
      }
      if (dto.currency != null) patch.currency = String(dto.currency).toUpperCase();
      if (dto.billing_interval != null) {
        const interval = String(dto.billing_interval).toLowerCase();
        if (!["day", "week", "month", "year"].includes(interval)) {
          throw new BadRequestException("Invalid billing_interval");
        }
        patch.billing_interval = interval;
      }
      if (dto.billing_interval_count != null) {
        patch.billing_interval_count = Math.max(
          1,
          Number(dto.billing_interval_count) || 1,
        );
      }
      if (dto.start_date_mode !== undefined) {
        patch.start_date_mode = dto.start_date_mode || null;
      }
      if (dto.start_date !== undefined) {
        patch.start_date = dto.start_date || null;
      }
      if (dto.consent !== undefined) {
        patch.consent = dto.consent;
        if (dto.consent === true) patch.consent_at = new Date();
      }
      if (dto.donation_method !== undefined) {
        patch.donation_method = dto.donation_method || null;
      }
      if (dto.project_id !== undefined) {
        patch.project_id = dto.project_id || null;
      }
      if (dto.campaign_id !== undefined) {
        patch.campaign_id =
          dto.campaign_id == null || dto.campaign_id === ("" as any)
            ? null
            : Number(dto.campaign_id);
      }
      if (dto.donation_type !== undefined) {
        patch.donation_type = dto.donation_type || null;
      }
      if (dto.on_behalf_names !== undefined) {
        const names = String(dto.on_behalf_names || "").trim();
        patch.on_behalf_names = names || null;
      }
      if (dto.status != null) {
        const status = String(dto.status).toLowerCase();
        if (!["active", "canceled", "past_due", "failed"].includes(status)) {
          throw new BadRequestException("Invalid status");
        }
        patch.status = status;
      }

      // Interval count > 1 or prepaid_periods → N paid installments; amount stays installment
      const prepaidCount = this.resolveStaffPrepaidInstallmentCount({
        prepaid_periods:
          dto.prepaid_periods !== undefined
            ? dto.prepaid_periods
            : subscription.prepaid_periods,
        billing_interval_count:
          dto.billing_interval_count !== undefined
            ? dto.billing_interval_count
            : subscription.billing_interval_count,
      });
      const prepaidTouched =
        dto.prepaid_periods !== undefined ||
        dto.billing_interval_count !== undefined ||
        dto.amount != null ||
        dto.total_amount !== undefined;

      if (prepaidCount && prepaidCount >= 2 && prepaidTouched) {
        const interval = String(
          patch.billing_interval || subscription.billing_interval || "month",
        ).toLowerCase();
        const startDate =
          (patch.start_date as string | null | undefined) ??
          subscription.start_date;
        const startRef = startDate
          ? new Date(`${startDate}T12:00:00`)
          : new Date();
        const prepaid = resolveSubscriptionPrepaidPeriodKeys(
          prepaidCount,
          interval === "year" ? "month" : (interval as any),
          Number.isNaN(startRef.getTime()) ? new Date() : startRef,
        );
        const installmentAmount = Number(
          patch.amount ?? subscription.amount ?? 0,
        );
        const totalFromDto =
          dto.total_amount != null ? Number(dto.total_amount) : NaN;
        patch.billing_interval_count = 1;
        patch.total_amount =
          Number.isFinite(totalFromDto) && totalFromDto > 0
            ? Math.round(totalFromDto)
            : Math.round(installmentAmount * prepaidCount);
        patch.prepaid_months = prepaid.prepaidMonths;
        patch.prepaid_periods = prepaid.prepaidPeriods;
        patch.prepaid_start_period_key = prepaid.start;
        patch.prepaid_end_period_key = prepaid.end;
      } else if (dto.prepaid_periods !== undefined) {
        const interval = String(
          patch.billing_interval || subscription.billing_interval || "month",
        ).toLowerCase();
        const prepaid = resolveSubscriptionPrepaidPeriodKeys(
          dto.prepaid_periods,
          interval === "year" ? "month" : (interval as any),
        );
        patch.prepaid_months = prepaid.prepaidMonths;
        patch.prepaid_periods = prepaid.prepaidPeriods;
        patch.prepaid_start_period_key = prepaid.start;
        patch.prepaid_end_period_key = prepaid.end;
      }
      if (dto.initial_donation_id !== undefined) {
        if (dto.initial_donation_id == null) {
          patch.initial_donation_id = null;
        } else {
          const donationId = Number(dto.initial_donation_id);
          const donation = await this.donationRepository.findOne({
            where: { id: donationId, is_archived: false },
          });
          if (!donation) {
            throw new BadRequestException("Initial donation not found");
          }
          patch.initial_donation_id = donationId;
        }
      }
      if (
        !subscription.referred_by &&
        (patch.initial_donation_id || patch.donor_id)
      ) {
        const referredBy = await resolveRecurringReferrerUserId(
          this.donationRepository,
          {
            donationId:
              patch.initial_donation_id ?? subscription.initial_donation_id,
            donorId: patch.donor_id ?? subscription.donor_id,
          },
        );
        if (referredBy) patch.referred_by = referredBy;
      }
    }

    if (Object.keys(patch).length === 0) {
      return subscription;
    }

    if (userId && userId > 0) {
      (patch as any).updated_by = { id: userId };
    }

    await this.recurringDonationRepo.update(id, patch);
    const updated = await this.recurringDonationRepo.findOne({ where: { id } });
    if (!updated) {
      throw new NotFoundException("Recurring donation subscription not found");
    }

    const donorId = updated.donor_id;
    if (donorId && updated.status === "active") {
      await this.donorRepository.update(donorId, { recurring: true });
    }

    // Ensure missing prepaid paid installments exist (never deletes existing rows)
    const updatedPrepaidCount = resolvePrepaidPeriodCount({
      prepaid_periods: updated.prepaid_periods,
      prepaid_months: updated.prepaid_months,
    });
    if (
      !updated.stripe_subscription_id &&
      updatedPrepaidCount &&
      updatedPrepaidCount >= 2
    ) {
      const totalFromDto =
        dto.total_amount != null
          ? Number(dto.total_amount)
          : updated.total_amount != null
            ? Number(updated.total_amount)
            : null;
      await this.ensureStaffPrepaidPaidInstallments(updated, {
        totalAmount: totalFromDto,
        userId,
      });
      const refreshed = await this.recurringDonationRepo.findOne({
        where: { id },
      });
      if (refreshed) return refreshed;
    }

    return updated;
  }

  /**
   * Non-Stripe recurring: same Recurring Donations list as Stripe.
   * Stripe auto-charges; these rows are reminded via cron.
   */
  async ensureNonStripeSubscriptionFromDonation(params: {
    donationId: number;
    donorId: number | null;
    amount: number | null;
    currency?: string | null;
    donationMethod?: string | null;
    projectId?: string | null;
    campaignId?: number | null;
    donationType?: string | null;
    billingInterval: "day" | "week" | "month";
    billingIntervalCount?: number;
    startDateMode?: string | null;
    startDate?: string | null;
    consent?: boolean | null;
    prepaidPeriods?: number | null;
  }): Promise<RecurringDonation | null> {
    if (!params.donationId) return null;

    const existing = await this.recurringDonationRepo.findOne({
      where: {
        initial_donation_id: params.donationId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (existing) {
      const patch: Partial<RecurringDonation> = {};
      if (params.donorId && !existing.donor_id) patch.donor_id = params.donorId;
      if (!existing.referred_by) {
        const referredBy = await resolveRecurringReferrerUserId(
          this.donationRepository,
          {
            donationId: params.donationId,
            donorId: params.donorId ?? existing.donor_id,
          },
        );
        if (referredBy) patch.referred_by = referredBy;
      }
      if (params.consent === true && existing.consent !== true) {
        patch.consent = true;
        patch.consent_at = new Date();
      }
      const prepaid = resolveSubscriptionPrepaidPeriodKeys(
        params.prepaidPeriods,
        params.billingInterval,
      );
      if (
        prepaid.prepaidPeriods &&
        !existing.prepaid_periods &&
        !existing.prepaid_start_period_key
      ) {
        patch.prepaid_periods = prepaid.prepaidPeriods;
        patch.prepaid_months = prepaid.prepaidMonths;
        patch.prepaid_start_period_key = prepaid.start;
        patch.prepaid_end_period_key = prepaid.end;
      }
      if (Object.keys(patch).length) {
        await this.recurringDonationRepo.update(existing.id, patch);
        return this.recurringDonationRepo.findOne({ where: { id: existing.id } });
      }
      return existing;
    }

    const prepaid = resolveSubscriptionPrepaidPeriodKeys(
      params.prepaidPeriods,
      params.billingInterval,
    );

    const referredBy = await resolveRecurringReferrerUserId(
      this.donationRepository,
      { donationId: params.donationId, donorId: params.donorId },
    );

    const row = this.recurringDonationRepo.create({
      record_type: "subscription",
      parent_id: null,
      initial_donation_id: params.donationId,
      donor_id: params.donorId,
      referred_by: referredBy,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      billing_interval: params.billingInterval,
      billing_interval_count: params.billingIntervalCount ?? 1,
      start_date_mode: params.startDateMode ?? "same_date",
      start_date: params.startDate ?? null,
      consent: params.consent ?? null,
      consent_at: params.consent === true ? new Date() : null,
      amount: params.amount,
      currency: params.currency || "PKR",
      status: "active",
      donation_method: params.donationMethod ?? null,
      project_id: params.projectId ?? null,
      campaign_id: params.campaignId ?? null,
      donation_type: params.donationType ?? null,
      prepaid_months: prepaid.prepaidMonths,
      prepaid_periods: prepaid.prepaidPeriods,
      prepaid_start_period_key: prepaid.start,
      prepaid_end_period_key: prepaid.end,
    });
    return this.recurringDonationRepo.save(row);
  }

  /**
   * When a non-Stripe donation linked to a subscription is completed,
   * settle the oldest pending period due (FIFO). Never deletes donors/donations.
   * If no pending due exists, creates a completed installment (legacy / first pay).
   */
  async recordNonStripeInstallmentFromDonation(
    donationId: number,
  ): Promise<{ recorded: boolean; reason?: string }> {
    if (!donationId) {
      return { recorded: false, reason: "Missing donation id" };
    }

    const donation = await this.donationRepository.findOne({
      where: { id: donationId },
    });
    if (!donation) {
      return { recorded: false, reason: "Donation not found" };
    }

    const status = String(donation.status || "")
      .trim()
      .toLowerCase();
    if (!["completed", "paid", "success"].includes(status)) {
      return { recorded: false, reason: "Donation not successful yet" };
    }

    // Prefer subscription created from this donation; else active non-Stripe sub for donor
    let master = await this.recurringDonationRepo.findOne({
      where: {
        initial_donation_id: donationId,
        record_type: "subscription",
        is_archived: false,
      },
    });

    if (!master && donation.donor_id) {
      const taggedSubId = Number(
        (donation as any)?.manual_recurring_intent?.recurring_subscription_id,
      );
      if (Number.isFinite(taggedSubId) && taggedSubId > 0) {
        master = await this.recurringDonationRepo.findOne({
          where: {
            id: taggedSubId,
            record_type: "subscription",
            is_archived: false,
          },
        });
      }
    }

    if (!master && donation.donor_id) {
      master = await this.recurringDonationRepo
        .createQueryBuilder("rd")
        .where("rd.record_type = :type", { type: "subscription" })
        .andWhere("rd.is_archived = false")
        .andWhere("rd.status = :status", { status: "active" })
        .andWhere("rd.stripe_subscription_id IS NULL")
        .andWhere("rd.donor_id = :donorId", { donorId: donation.donor_id })
        .orderBy("rd.id", "DESC")
        .getOne();
    }

    if (!master) {
      return { recorded: false, reason: "No non-Stripe subscription found" };
    }
    if (master.stripe_subscription_id) {
      return {
        recorded: false,
        reason: "Stripe subscription — installments via webhook",
      };
    }

    const invoiceKey = `donation-${donationId}`;
    const existing = await this.recurringDonationRepo.findOne({
      where: {
        record_type: "installment",
        stripe_invoice_id: invoiceKey,
        is_archived: false,
      },
    });
    if (existing) {
      return { recorded: false, reason: "Installment already recorded" };
    }

    const isInitial = master.initial_donation_id === donationId;
    const prepaidPeriods = resolvePrepaidPeriodCount({
      prepaid_periods: master.prepaid_periods,
      prepaid_months: master.prepaid_months,
    });
    if (
      isInitial &&
      prepaidPeriods != null &&
      prepaidPeriods >= 1 &&
      master.prepaid_start_period_key &&
      master.prepaid_end_period_key
    ) {
      const prepaidResult = await this.settlePrepaidPeriodsFromDonation(
        master,
        donation,
      );
      if (prepaidResult.recorded) {
        return prepaidResult;
      }
      const fullySettled = await this.isPrepaidCoverageFullySettled(master);
      if (fullySettled) {
        return {
          recorded: false,
          reason: prepaidResult.reason || "Prepaid periods already settled",
        };
      }
    }

    // Open current (+ gap) period dues before settling so first pay always has a target
    await this.ensurePeriodDuesForSubscription(master);

    const oldestPending = await this.recurringDonationRepo
      .createQueryBuilder("inst")
      .where("inst.parent_id = :parentId", { parentId: master.id })
      .andWhere("inst.record_type = :type", { type: "installment" })
      .andWhere("inst.is_archived = false")
      .andWhere("LOWER(COALESCE(inst.status, '')) = :status", {
        status: "pending",
      })
      .orderBy("inst.period_key", "ASC")
      .addOrderBy("inst.created_at", "ASC")
      .addOrderBy("inst.id", "ASC")
      .getOne();

    const paidAt = new Date();
    const amount = donation.amount ?? master.amount;
    const currency = donation.currency || master.currency || "PKR";

    if (oldestPending) {
      await this.recurringDonationRepo.update(oldestPending.id, {
        initial_donation_id: master.initial_donation_id,
        donor_id: master.donor_id ?? donation.donor_id,
        stripe_invoice_id: invoiceKey,
        stripe_payment_intent_id: String(donationId),
        amount,
        currency,
        status: "completed",
        donation_method: donation.donation_method || master.donation_method,
        project_id: donation.project_id || master.project_id,
        campaign_id: donation.campaign_id ?? master.campaign_id,
        donation_type: donation.donation_type || master.donation_type,
        paid_at: paidAt,
        stripe_billing_reason: isInitial
          ? "initial_payment"
          : "period_settled",
      });
    } else {
      const frequency = billingIntervalToFrequency(master.billing_interval);
      const periodKey = frequency
        ? getPeriodKeyForFrequency(frequency)
        : null;
      const installment = this.recurringDonationRepo.create({
        record_type: "installment",
        parent_id: master.id,
        initial_donation_id: master.initial_donation_id,
        donor_id: master.donor_id ?? donation.donor_id,
        stripe_subscription_id: null,
        stripe_invoice_id: invoiceKey,
        stripe_payment_intent_id: String(donationId),
        billing_interval: master.billing_interval,
        billing_interval_count: master.billing_interval_count,
        amount,
        currency,
        status: "completed",
        donation_method: donation.donation_method || master.donation_method,
        project_id: donation.project_id || master.project_id,
        campaign_id: donation.campaign_id ?? master.campaign_id,
        donation_type: donation.donation_type || master.donation_type,
        paid_at: paidAt,
        period_key: periodKey,
        stripe_billing_reason: isInitial
          ? "initial_payment"
          : "manual_payment",
      });
      await this.recurringDonationRepo.save(installment);
    }

    if (master.status !== "active") {
      await this.recurringDonationRepo.update(master.id, { status: "active" });
    }

    // --- ENABLE LATER: donor paid — reset unpaid reminder streak ---
    // await this.resetUnpaidPaymentReminderCount(master.id);
    // --- END ENABLE LATER ---

    return { recorded: true };
  }

  /** Whether a completed installment exists for this subscription + period. */
  async hasCompletedInstallmentForPeriod(
    subscriptionId: number,
    periodKey: string,
  ): Promise<boolean> {
    if (!subscriptionId || !periodKey) return false;
    const row = await this.recurringDonationRepo
      .createQueryBuilder("inst")
      .where("inst.parent_id = :parentId", { parentId: subscriptionId })
      .andWhere("inst.record_type = :type", { type: "installment" })
      .andWhere("inst.is_archived = false")
      .andWhere("inst.period_key = :periodKey", { periodKey })
      .andWhere("LOWER(COALESCE(inst.status, '')) IN (:...statuses)", {
        statuses: ["completed", "paid", "success"],
      })
      .getOne();
    return Boolean(row);
  }

  async isPrepaidCoverageFullySettled(
    subscription: Pick<
      RecurringDonation,
      | "id"
      | "prepaid_start_period_key"
      | "prepaid_end_period_key"
      | "billing_interval"
    >,
  ): Promise<boolean> {
    if (
      !subscription?.id ||
      !subscription.prepaid_start_period_key ||
      !subscription.prepaid_end_period_key
    ) {
      return false;
    }
    const periodKeys = listPrepaidPeriodKeysInRange(
      subscription.prepaid_start_period_key,
      subscription.prepaid_end_period_key,
      subscription.billing_interval || "month",
    );
    if (!periodKeys.length) return false;
    const settled = await Promise.all(
      periodKeys.map((pk) =>
        this.hasCompletedInstallmentForPeriod(subscription.id, pk),
      ),
    );
    return settled.every(Boolean);
  }

  /**
   * Split upfront prepaid payment into one completed installment per covered period.
   * Each period gets the subscription per-period amount (total ÷ prepaid_periods).
   */
  private async settlePrepaidPeriodsFromDonation(
    master: RecurringDonation,
    donation: Donation,
  ): Promise<{ recorded: boolean; reason?: string }> {
    const startKey = master.prepaid_start_period_key;
    const endKey = master.prepaid_end_period_key;
    if (!startKey || !endKey) {
      return { recorded: false, reason: "Missing prepaid period keys" };
    }

    const periodKeys = listPrepaidPeriodKeysInRange(
      startKey,
      endKey,
      master.billing_interval || "month",
    );
    if (!periodKeys.length) {
      return { recorded: false, reason: "No prepaid periods" };
    }

    const allSettled = await Promise.all(
      periodKeys.map((pk) =>
        this.hasCompletedInstallmentForPeriod(master.id, pk),
      ),
    );
    if (allSettled.every(Boolean)) {
      return { recorded: false, reason: "Prepaid periods already settled" };
    }

    const paidAt = new Date();
    const periodAmount = Number(master.amount) || 0;
    const currency = donation.currency || master.currency || "PKR";
    let created = 0;

    for (const periodKey of periodKeys) {
      const invoiceKey = prepaidInstallmentInvoiceKey(donation.id, periodKey);

      const byInvoice = await this.recurringDonationRepo.findOne({
        where: {
          record_type: "installment",
          stripe_invoice_id: invoiceKey,
          is_archived: false,
        },
      });
      if (byInvoice) continue;

      const pending = await this.recurringDonationRepo.findOne({
        where: {
          parent_id: master.id,
          record_type: "installment",
          period_key: periodKey,
          is_archived: false,
        },
      });

      if (pending) {
        await this.recurringDonationRepo.update(pending.id, {
          initial_donation_id: master.initial_donation_id,
          donor_id: master.donor_id ?? donation.donor_id,
          stripe_invoice_id: invoiceKey,
          stripe_payment_intent_id: String(donation.id),
          amount: periodAmount,
          currency,
          status: "completed",
          donation_method: donation.donation_method || master.donation_method,
          project_id: donation.project_id || master.project_id,
          campaign_id: donation.campaign_id ?? master.campaign_id,
          donation_type: donation.donation_type || master.donation_type,
          paid_at: paidAt,
          stripe_billing_reason: "prepaid_period",
        });
        created += 1;
        continue;
      }

      const existingCompleted = await this.recurringDonationRepo
        .createQueryBuilder("inst")
        .where("inst.parent_id = :parentId", { parentId: master.id })
        .andWhere("inst.period_key = :periodKey", { periodKey })
        .andWhere("inst.record_type = :type", { type: "installment" })
        .andWhere("inst.is_archived = false")
        .andWhere("LOWER(COALESCE(inst.status, '')) IN (:...statuses)", {
          statuses: ["completed", "paid", "success"],
        })
        .getOne();
      if (existingCompleted) continue;

      const installment = this.recurringDonationRepo.create({
        record_type: "installment",
        parent_id: master.id,
        initial_donation_id: master.initial_donation_id,
        donor_id: master.donor_id ?? donation.donor_id,
        stripe_subscription_id: null,
        stripe_invoice_id: invoiceKey,
        stripe_payment_intent_id: String(donation.id),
        billing_interval: master.billing_interval,
        billing_interval_count: master.billing_interval_count,
        amount: periodAmount,
        currency,
        status: "completed",
        donation_method: donation.donation_method || master.donation_method,
        project_id: donation.project_id || master.project_id,
        campaign_id: donation.campaign_id ?? master.campaign_id,
        donation_type: donation.donation_type || master.donation_type,
        paid_at: paidAt,
        period_key: periodKey,
        stripe_billing_reason: "prepaid_period",
      });
      await this.recurringDonationRepo.save(installment);
      created += 1;
    }

    if (master.status !== "active") {
      await this.recurringDonationRepo.update(master.id, { status: "active" });
    }

    if (created === 0 && allSettled.some(Boolean)) {
      return { recorded: false, reason: "Prepaid periods already settled" };
    }

    return { recorded: created > 0 };
  }

  /**
   * Ensure pending period-due installment rows exist through the current period.
   * Does not create or modify donations/donors. Skips periods already covered by
   * legacy completed installments that have no period_key (chronological credit).
   */
  async ensurePeriodDuesForSubscription(
    subscription: RecurringDonation,
    options?: { upToPeriodKey?: string; maxKeys?: number },
  ): Promise<{ created: number; pending_count: number }> {
    if (!subscription?.id || subscription.stripe_subscription_id) {
      return { created: 0, pending_count: 0 };
    }

    const frequency = billingIntervalToFrequency(subscription.billing_interval);
    if (!frequency) {
      return { created: 0, pending_count: 0 };
    }

    const now = new Date();
    const upToKey =
      options?.upToPeriodKey || getPeriodKeyForFrequency(frequency, now);
    const startRef = this.resolveSubscriptionPeriodStart(subscription);
    const endRef = this.resolvePeriodKeyEndRef(frequency, upToKey, now);
    const maxKeys = options?.maxKeys ?? 36;
    const periodKeys = listPeriodKeysBetween(
      frequency,
      startRef,
      endRef,
      maxKeys,
    );

    const existing = await this.recurringDonationRepo.find({
      where: {
        parent_id: subscription.id,
        record_type: "installment",
        is_archived: false,
      },
      select: ["id", "period_key", "status"],
    });

    const keyed = new Set(
      existing
        .map((r) => String(r.period_key || "").trim())
        .filter(Boolean),
    );
    const legacyCompletedCount = existing.filter((r) => {
      const st = String(r.status || "").toLowerCase();
      return (
        !r.period_key &&
        ["completed", "paid", "success"].includes(st)
      );
    }).length;

    let created = 0;
    let skipLegacy = legacyCompletedCount;

    for (const periodKey of periodKeys) {
      if (keyed.has(periodKey)) continue;

      if (isSubscriptionPrepaidPeriodCovered(subscription, periodKey)) {
        // Prepaid coverage — installments created on payment, not pending dues
        continue;
      }

      const isCurrent = periodKey === upToKey;
      // Credit historical completed installments (no period_key) against older periods only
      if (!isCurrent && skipLegacy > 0) {
        skipLegacy -= 1;
        continue;
      }

      const row = this.recurringDonationRepo.create({
        record_type: "installment",
        parent_id: subscription.id,
        initial_donation_id: subscription.initial_donation_id,
        donor_id: subscription.donor_id,
        stripe_subscription_id: null,
        stripe_invoice_id: null,
        billing_interval: subscription.billing_interval,
        billing_interval_count: subscription.billing_interval_count,
        amount: subscription.amount,
        currency: subscription.currency || "PKR",
        status: "pending",
        donation_method: subscription.donation_method,
        project_id: subscription.project_id,
        campaign_id: subscription.campaign_id,
        donation_type: subscription.donation_type,
        paid_at: null,
        period_key: periodKey,
        stripe_billing_reason: "period_due",
      });
      await this.recurringDonationRepo.save(row);
      keyed.add(periodKey);
      created += 1;
    }

    const pending_count = await this.recurringDonationRepo
      .createQueryBuilder("inst")
      .where("inst.parent_id = :parentId", { parentId: subscription.id })
      .andWhere("inst.record_type = :type", { type: "installment" })
      .andWhere("inst.is_archived = false")
      .andWhere("LOWER(COALESCE(inst.status, '')) = :status", {
        status: "pending",
      })
      .getCount();

    return { created, pending_count };
  }

  private resolveSubscriptionPeriodStart(
    subscription: RecurringDonation,
  ): Date {
    if (subscription.start_date) {
      const d = new Date(`${subscription.start_date}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (subscription.created_at) {
      return new Date(subscription.created_at);
    }
    return new Date();
  }

  /** Approximate a Date inside a period key for listPeriodKeysBetween end bound. */
  private resolvePeriodKeyEndRef(
    frequency: CampaignTargetFrequency,
    periodKey: string,
    fallback: Date,
  ): Date {
    const monthly = /^(\d{4})-(\d{2})$/.exec(periodKey);
    if (monthly) {
      return new Date(Number(monthly[1]), Number(monthly[2]) - 1, 15);
    }
    const daily = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodKey);
    if (daily) {
      return new Date(
        Number(daily[1]),
        Number(daily[2]) - 1,
        Number(daily[3]),
      );
    }
    const weekly = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(periodKey);
    if (weekly) {
      return new Date(weekly[1] + "T12:00:00");
    }
    if (frequency === CampaignTargetFrequency.YEARLY && /^\d{4}$/.test(periodKey)) {
      return new Date(Number(periodKey), 6, 1);
    }
    return fallback;
  }

  /**
   * Unpaid payment reminder tracking — used when auto-disable after 3 reminders is enabled.
   * Wire via commented blocks in processNonStripeLedgerReminders + sendInstallmentPaymentLink.
   */
  getUnpaidPaymentReminderCount(subscription: RecurringDonation | null | undefined): number {
    const n = Number(subscription?.unpaid_payment_reminder_count ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  isSubscriptionDisabledByUnpaidReminders(
    subscription: RecurringDonation | null | undefined,
  ): boolean {
    if (!subscription) return false;
    const status = String(subscription.status || "").toLowerCase();
    if (status === RECURRING_SUBSCRIPTION_DISABLED_STATUS) {
      return (
        String(subscription.stripe_billing_reason || "") ===
        RECURRING_SUBSCRIPTION_DISABLED_REASON
      );
    }
    return (
      this.getUnpaidPaymentReminderCount(subscription) >=
      MAX_UNPAID_PAYMENT_REMINDERS_BEFORE_DISABLE
    );
  }

  async isSubscriptionBlockedByUnpaidReminders(
    subscriptionId: number,
  ): Promise<boolean> {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id: subscriptionId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription) return true;
    if (subscription.stripe_subscription_id) return false;
    return this.isSubscriptionDisabledByUnpaidReminders(subscription);
  }

  /** Call after a successful payment-link reminder send. Returns new count + whether disabled. */
  async recordUnpaidPaymentReminderSent(subscriptionId: number): Promise<{
    count: number;
    disabled: boolean;
  }> {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id: subscriptionId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription || subscription.stripe_subscription_id) {
      return { count: 0, disabled: false };
    }

    const nextCount =
      this.getUnpaidPaymentReminderCount(subscription) + 1;
    const patch: Partial<RecurringDonation> = {
      unpaid_payment_reminder_count: nextCount,
    };

    let disabled = false;
    if (nextCount >= MAX_UNPAID_PAYMENT_REMINDERS_BEFORE_DISABLE) {
      disabled = true;
      patch.status = RECURRING_SUBSCRIPTION_DISABLED_STATUS;
      patch.stripe_billing_reason = RECURRING_SUBSCRIPTION_DISABLED_REASON;
      this.logger.warn(
        `Recurring subscription ${subscriptionId} disabled after ${nextCount} unpaid payment reminders`,
      );
    }

    await this.recurringDonationRepo.update(subscriptionId, patch);
    return { count: nextCount, disabled };
  }

  /** Reset reminder streak when donor pays an installment / initial donation. */
  async resetUnpaidPaymentReminderCount(subscriptionId: number): Promise<void> {
    await this.recurringDonationRepo.update(subscriptionId, {
      unpaid_payment_reminder_count: 0,
    });
  }

  /**
   * Manual send of the same installment payment link the cron uses
   * (donation failure/paylink email + abandon WhatsApp).
   * Non-Stripe subscriptions only.
   */
  async sendInstallmentPaymentLink(subscriptionId: number): Promise<{
    donation_id: number;
    email_sent: boolean;
    whatsapp_sent: boolean;
    pending_installment_count: number;
    errors: string[];
  }> {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id: subscriptionId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }
    if (subscription.stripe_subscription_id) {
      throw new BadRequestException(
        "Stripe subscriptions are charged automatically — no manual installment link",
      );
    }

    // --- ENABLE LATER: block manual link if 3 unpaid reminders already sent ---
    // if (await this.isSubscriptionBlockedByUnpaidReminders(subscriptionId)) {
    //   throw new BadRequestException(
    //     `Recurring subscription is disabled after ${MAX_UNPAID_PAYMENT_REMINDERS_BEFORE_DISABLE} unpaid payment reminders`,
    //   );
    // }
    // --- END ENABLE LATER ---

    if (!subscription.donor_id) {
      throw new BadRequestException("Subscription has no donor linked");
    }

    const dues = await this.ensurePeriodDuesForSubscription(subscription);

    const donor = await this.donorRepository.findOne({
      where: { id: subscription.donor_id },
    });
    if (!donor) {
      throw new BadRequestException("Donor not found");
    }
    if (!donor.email && !donor.phone) {
      throw new BadRequestException("Donor has no email or phone");
    }

    const donation = await this.resolveOrCreateInstallmentLinkDonation(
      subscription,
      donor,
    );
    if (!donation?.id) {
      throw new BadRequestException(
        "Could not create or find a pending donation for the payment link",
      );
    }

    const donorName =
      donor.name ||
      donor.first_name ||
      donor.email ||
      `Donor #${donor.id}`;
    const amount =
      Number(subscription.amount) || Number(donation.amount) || 0;

    (donation as any).donor_name = donorName;
    (donation as any).donor = donor;

    const errors: string[] = [];
    let email_sent = false;
    let whatsapp_sent = false;

    if (donor.email) {
      try {
        email_sent =
          !!(await this.emailService.sendRecurringPaymentReminderEmail(
            donation,
            donor.email,
          ));
        if (!email_sent) errors.push("Payment link email failed");
      } catch (err: any) {
        errors.push(err?.message || "Payment link email failed");
      }
    }

    if (donor.phone) {
      try {
        whatsapp_sent = !!(await this.whatsAppService.sendRecurringPaymentReminder({
          phoneNumber: donor.phone,
          amount: String(amount),
          donationId: donation.donation_public_id || donation.id,
          donationPublicId: donation.donation_public_id,
        }));
        if (!whatsapp_sent) errors.push("Payment link WhatsApp failed");
      } catch (err: any) {
        errors.push(err?.message || "Payment link WhatsApp failed");
      }
    }

    if (!email_sent && !whatsapp_sent) {
      throw new BadRequestException(
        errors.join("; ") || "Failed to send installment payment link",
      );
    }

    // --- ENABLE LATER: count reminder toward auto-disable after 3 unpaid ---
    // await this.recordUnpaidPaymentReminderSent(subscriptionId);
    // --- END ENABLE LATER ---

    return {
      donation_id: donation.id,
      email_sent,
      whatsapp_sent,
      pending_installment_count: dues.pending_count,
      errors,
    };
  }

  /**
   * Admin: mark selected pending installment dues as paid.
   * Does not delete donors/donations; does not create donations.
   */
  async markInstallmentsPaid(
    subscriptionId: number,
    opts: { installmentIds: number[]; note?: string },
    userId?: number | null,
  ): Promise<{
    marked: number;
    installment_ids: number[];
    pending_remaining: number;
  }> {
    await assertRecurringReconciler(
      this.permissionsService,
      { id: userId },
      "completed",
    );

    const ids = [
      ...new Set(
        (opts.installmentIds || [])
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    if (!ids.length) {
      throw new BadRequestException("Select at least one installment");
    }

    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id: subscriptionId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }
    if (subscription.stripe_subscription_id) {
      throw new BadRequestException(
        "Stripe installments are settled via Stripe webhooks",
      );
    }

    const rows = await this.recurringDonationRepo
      .createQueryBuilder("inst")
      .where("inst.id IN (:...ids)", { ids })
      .andWhere("inst.parent_id = :parentId", { parentId: subscriptionId })
      .andWhere("inst.record_type = :type", { type: "installment" })
      .andWhere("inst.is_archived = false")
      .getMany();

    if (!rows.length) {
      throw new BadRequestException(
        "No matching installments found for this subscription",
      );
    }

    const pendingRows = rows.filter(
      (r) => String(r.status || "").toLowerCase() === "pending",
    );
    if (!pendingRows.length) {
      throw new BadRequestException(
        "Selected installments are already paid (or not pending)",
      );
    }

    const paidAt = new Date();
    const noteSuffix = opts.note
      ? String(opts.note).trim().slice(0, 120)
      : "";

    for (const row of pendingRows) {
      await this.recurringDonationRepo.update(row.id, {
        status: "completed",
        paid_at: paidAt,
        stripe_invoice_id: `manual-mark-${row.id}`,
        stripe_billing_reason: noteSuffix
          ? `manual_mark_paid:${noteSuffix}`
          : "manual_mark_paid",
      });
    }

    if (subscription.status !== "active") {
      await this.recurringDonationRepo.update(subscription.id, {
        status: "active",
      });
    }

    // --- ENABLE LATER: admin marked paid — reset unpaid reminder streak ---
    // await this.resetUnpaidPaymentReminderCount(subscriptionId);
    // --- END ENABLE LATER ---

    const pending_remaining = await this.recurringDonationRepo
      .createQueryBuilder("inst")
      .where("inst.parent_id = :parentId", { parentId: subscriptionId })
      .andWhere("inst.record_type = :type", { type: "installment" })
      .andWhere("inst.is_archived = false")
      .andWhere("LOWER(COALESCE(inst.status, '')) = :status", {
        status: "pending",
      })
      .getCount();

    return {
      marked: pendingRows.length,
      installment_ids: pendingRows.map((r) => r.id),
      pending_remaining,
    };
  }

  /**
   * Staff: edit one installment on a subscription (status / amount / period_key).
   * Non-Stripe only. Does not create or delete donations.
   */
  async updateStaffInstallment(
    subscriptionId: number,
    installmentId: number,
    dto: {
      status?: string;
      amount?: number;
      period_key?: string | null;
      note?: string | null;
    },
    userId?: number | null,
  ): Promise<RecurringDonation> {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id: subscriptionId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }
    if (subscription.stripe_subscription_id) {
      throw new BadRequestException(
        "Stripe installments are managed via Stripe — edit is blocked",
      );
    }

    const installment = await this.recurringDonationRepo.findOne({
      where: {
        id: installmentId,
        parent_id: subscriptionId,
        record_type: "installment",
        is_archived: false,
      },
    });
    if (!installment) {
      throw new NotFoundException("Installment not found for this subscription");
    }

    const patch: Partial<RecurringDonation> = {};

    if (dto.status != null) {
      const status = String(dto.status).trim().toLowerCase();
      if (!["pending", "completed", "failed"].includes(status)) {
        throw new BadRequestException(
          "Installment status must be pending, completed, or failed",
        );
      }
      await assertRecurringReconciler(
        this.permissionsService,
        { id: userId },
        status,
        installment.status,
      );
      patch.status = status;
      if (status === "completed") {
        patch.paid_at = installment.paid_at || new Date();
        if (!installment.stripe_billing_reason) {
          patch.stripe_billing_reason = "staff_installment_edit";
        }
      } else {
        patch.paid_at = null;
      }
    }

    if (dto.amount != null) {
      const amount = Number(dto.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException("amount must be greater than 0");
      }
      patch.amount = amount;
    }

    if (dto.period_key !== undefined) {
      const key = dto.period_key == null ? null : String(dto.period_key).trim();
      patch.period_key = key || null;
    }

    if (dto.note != null && String(dto.note).trim()) {
      patch.stripe_billing_reason = `staff_edit:${String(dto.note)
        .trim()
        .slice(0, 100)}`;
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException("No installment fields to update");
    }

    await this.recurringDonationRepo.update(installmentId, patch);
    const updated = await this.recurringDonationRepo.findOne({
      where: { id: installmentId },
    });
    if (!updated) {
      throw new NotFoundException("Installment not found after update");
    }

    if (
      String(updated.status || "").toLowerCase() === "completed" &&
      subscription.donor_id
    ) {
      await this.resetUnpaidPaymentReminderCount(subscriptionId);
    }

    return updated;
  }

  /**
   * Soft-archive a subscription and its installment rows (staff delete).
   * Does not delete donors or donation records.
   */
  async archiveStaffSubscription(
    subscriptionId: number,
    userId?: number | null,
  ): Promise<{ id: number; archived_installments: number }> {
    const subscription = await this.recurringDonationRepo.findOne({
      where: {
        id: subscriptionId,
        record_type: "subscription",
        is_archived: false,
      },
    });
    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }

    const patch: Partial<RecurringDonation> = { is_archived: true };
    if (userId && userId > 0) {
      (patch as any).updated_by = { id: userId };
    }

    await this.recurringDonationRepo.update(subscriptionId, patch);
    const childResult = await this.recurringDonationRepo.update(
      {
        parent_id: subscriptionId,
        record_type: "installment" as const,
        is_archived: false,
      },
      { is_archived: true },
    );

    return {
      id: subscriptionId,
      archived_installments: childResult?.affected || 0,
    };
  }

  /**
   * Soft-archive one installment row (staff delete). Does not touch donors/donations.
   */
  async archiveStaffInstallment(
    subscriptionId: number,
    installmentId: number,
    userId?: number | null,
  ): Promise<RecurringDonation> {
    const installment = await this.recurringDonationRepo.findOne({
      where: {
        id: installmentId,
        parent_id: subscriptionId,
        record_type: "installment",
        is_archived: false,
      },
    });
    if (!installment) {
      throw new NotFoundException("Installment not found for this subscription");
    }

    const patch: Partial<RecurringDonation> = { is_archived: true };
    if (userId && userId > 0) {
      (patch as any).updated_by = { id: userId };
    }
    await this.recurringDonationRepo.update(installmentId, patch);

    const updated = await this.recurringDonationRepo.findOne({
      where: { id: installmentId },
    });
    if (!updated) {
      throw new NotFoundException("Installment not found after archive");
    }
    return updated;
  }

  /**
   * Resolve the exact pending donation for this subscription's installment link.
   * Prefer initial_donation_id when still pending/failed; else a donation tagged
   * to this subscription id. Never pick an unrelated pending donation for the donor.
   */
  async resolveOrCreateInstallmentLinkDonation(
    subscription: RecurringDonation,
    donor?: Donor | null,
  ): Promise<Donation | null> {
    const marker = `subscription #${subscription.id}`;

    // 1) Initial donation for this subscription, if still unpaid
    if (subscription.initial_donation_id) {
      const initial = await this.donationRepository.findOne({
        where: { id: subscription.initial_donation_id, is_archived: false },
        relations: ["donor"],
      });
      if (initial) {
        const status = String(initial.status || "").toLowerCase();
        if (status === "pending" || status === "failed") {
          return initial;
        }
      }
    }

    // 2) Existing pending/failed donation created for THIS subscription only
    const tagged = await this.donationRepository
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.donor", "donor")
      .where("d.donor_id = :donorId", { donorId: subscription.donor_id })
      .andWhere("d.status IN (:...statuses)", {
        statuses: ["pending", "failed"],
      })
      .andWhere("d.is_archived = false")
      .andWhere(
        `(d.note ILIKE :marker OR d.manual_recurring_intent->>'recurring_subscription_id' = :subId)`,
        { marker: `%${marker}%`, subId: String(subscription.id) },
      )
      .orderBy("d.id", "DESC")
      .getOne();
    if (tagged) return tagged;

    // 3) Create a new pending donation dedicated to this subscription
    const amount = Number(subscription.amount) || 0;
    if (amount <= 0) return null;

    let donorRow = donor;
    if (!donorRow && subscription.donor_id) {
      donorRow = await this.donorRepository.findOne({
        where: { id: subscription.donor_id },
      });
    }

    const created = this.donationRepository.create({
      donor_id: subscription.donor_id,
      campaign_id: subscription.campaign_id ?? null,
      project_id: subscription.project_id ?? null,
      amount,
      currency: subscription.currency || "PKR",
      donation_type: subscription.donation_type || "general",
      donation_method: subscription.donation_method || "online",
      donation_source: "recurring_ledger_reminder",
      status: "pending",
      on_behalf_names: subscription.on_behalf_names || null,
      note: `Installment payment link for ${marker}`,
      manual_recurring_intent: {
        recurring_subscription_id: subscription.id,
        installment_link: true,
      },
    });
    const saved = await this.donationRepository.save(created);
    await this.applySubscriptionReferrerToDonation(subscription, saved.id);
    if (donorRow) saved.donor = donorRow;
    return saved;
  }

  /**
   * Copy the subscription referrer onto a ledger-created donation (never overwrites).
   * Backfills subscription.referred_by for legacy rows that predate the column.
   */
  private async applySubscriptionReferrerToDonation(
    subscription: RecurringDonation,
    donationId: number,
  ): Promise<void> {
    if (!donationId) return;
    let referredBy = subscription.referred_by ?? null;
    if (!referredBy) {
      referredBy = await resolveRecurringReferrerUserId(
        this.donationRepository,
        {
          donationId: subscription.initial_donation_id,
          donorId: subscription.donor_id,
        },
      );
      if (referredBy && subscription.id) {
        await this.recurringDonationRepo.update(subscription.id, {
          referred_by: referredBy,
        });
        subscription.referred_by = referredBy;
      }
    }
    if (!referredBy) return;
    await this.donationRepository.query(
      `UPDATE "donations" SET "referred_by" = $1 WHERE "id" = $2 AND "referred_by" IS NULL`,
      [referredBy, donationId],
    );
  }

  async listForLookup(params?: EntityLookupParams): Promise<LookupOption[]> {
    return listEntityLookup(
      this.recurringDonationRepo,
      {
        profile: LOOKUP_PROFILES.recurring_donations,
        searchFields: ["stripe_subscription_id", "status"],
        orderBy: "id",
        labelFallback: (row) =>
          row.stripe_subscription_id
            ? String(row.stripe_subscription_id)
            : `Recurring #${row.id}`,
      },
      params,
    );
  }

  private async loadAttachmentsGroupedByRecurringId(ids: number[]) {
    const uniqueIds = [
      ...new Set(
        ids.filter((value) => Number.isFinite(value) && value > 0),
      ),
    ];
    const map = new Map<number, RecurringDonationAttachment[]>();
    if (!uniqueIds.length) return map;

    const rows = await this.recurringDonationAttachmentRepo.find({
      where: { recurring_donation: { id: In(uniqueIds) } },
      relations: ["uploaded_by", "recurring_donation"],
      order: { created_at: "DESC" },
    });

    for (const row of rows) {
      const recurringId = Number(row.recurring_donation?.id);
      if (!recurringId) continue;
      const bucket = map.get(recurringId) || [];
      bucket.push(row);
      map.set(recurringId, bucket);
    }

    return map;
  }

  async addAttachment(
    recurringDonationId: number,
    dto: AddRecurringDonationAttachmentDto,
    currentUser?: User | null,
  ): Promise<RecurringDonationAttachment> {
    const recurringDonation = await this.recurringDonationRepo.findOne({
      where: { id: recurringDonationId, is_archived: false },
    });
    if (!recurringDonation) {
      throw new NotFoundException(
        `Recurring donation with ID ${recurringDonationId} not found`,
      );
    }

    const attachment = this.recurringDonationAttachmentRepo.create({
      recurring_donation: recurringDonation,
      file_name: dto.file_name,
      file_url: dto.file_url,
      file_type: dto.file_type,
      description: dto.description || null,
      uploaded_by: currentUser || null,
    });
    return this.recurringDonationAttachmentRepo.save(attachment);
  }

  async removeAttachment(
    recurringDonationId: number,
    attachmentId: number,
  ): Promise<{ deleted: boolean }> {
    const attachment = await this.recurringDonationAttachmentRepo.findOne({
      where: { id: attachmentId },
      relations: ["recurring_donation"],
    });

    if (
      !attachment ||
      !attachment.recurring_donation ||
      Number(attachment.recurring_donation.id) !== Number(recurringDonationId)
    ) {
      throw new NotFoundException(
        "Attachment not found for this recurring donation",
      );
    }

    await this.recurringDonationAttachmentRepo.remove(attachment);
    return { deleted: true };
  }
}
