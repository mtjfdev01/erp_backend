import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RecurringDonation } from "./entities/recurring-donation.entity";
import { Donation } from "../entities/donation.entity";
import { Donor } from "src/dms/donor/entities/donor.entity";
import { EmailService } from "../../email/email.service";
import { WhatsAppService } from "../../utils/services/whatsapp.service";

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
  constructor(
    @InjectRepository(RecurringDonation)
    private readonly recurringDonationRepo: Repository<RecurringDonation>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(Donor)
    private readonly donorRepository: Repository<Donor>,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async search(payload: Record<string, any>) {
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
      .where("rd.record_type = :recordType", { recordType: "subscription" })
      .andWhere("rd.is_archived = false");

    if (filters.status) {
      qb.andWhere("rd.status = :status", { status: filters.status });
    }
    if (filters.billing_interval) {
      qb.andWhere("rd.billing_interval = :billingInterval", {
        billingInterval: filters.billing_interval,
      });
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

    const installmentStatus = String(filters.installment_status || "")
      .trim()
      .toLowerCase();
    if (installmentStatus === "pending") {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM recurring_donations inst
          WHERE inst.parent_id = rd.id
            AND inst.record_type = 'installment'
            AND inst.is_archived = false
        )`,
      );
    } else if (installmentStatus === "completed") {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM recurring_donations inst
          WHERE inst.parent_id = rd.id
            AND inst.record_type = 'installment'
            AND inst.is_archived = false
            AND LOWER(COALESCE(inst.status, '')) IN ('completed', 'paid', 'success')
        )`,
      );
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
      "rd.currency AS currency",
      "rd.status AS status",
      "rd.donation_method AS donation_method",
      "rd.project_id AS project_id",
      "rd.campaign_id AS campaign_id",
      "rd.donation_type AS donation_type",
      "rd.paid_at AS paid_at",
      "rd.created_at AS created_at",
      "rd.updated_at AS updated_at",
      'd."orderId" AS initial_order_id',
      "donor.name AS donor_name",
      "donor.email AS donor_email",
    ])
      .addSelect(
        `(SELECT COUNT(*)::int FROM recurring_donations inst WHERE inst.parent_id = rd.id AND inst.record_type = 'installment' AND inst.is_archived = false)`,
        "installment_count",
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
    });

    if (!subscription) {
      throw new NotFoundException("Recurring donation subscription not found");
    }

    const [installments, initialDonation, donor] = await Promise.all([
      this.recurringDonationRepo.find({
        where: {
          parent_id: id,
          record_type: "installment",
          is_archived: false,
        },
        order: { paid_at: "DESC", created_at: "DESC" },
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
    ]);

    const totalPaid = installments.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0,
    );

    return {
      subscription,
      installments,
      initial_donation: initialDonation,
      donor,
      summary: {
        installment_count: installments.length,
        total_paid_amount: totalPaid,
      },
    };
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
      if (params.consent === true && existing.consent !== true) {
        patch.consent = true;
        patch.consent_at = new Date();
      }
      if (Object.keys(patch).length) {
        await this.recurringDonationRepo.update(existing.id, patch);
        return this.recurringDonationRepo.findOne({ where: { id: existing.id } });
      }
      return existing;
    }

    const row = this.recurringDonationRepo.create({
      record_type: "subscription",
      parent_id: null,
      initial_donation_id: params.donationId,
      donor_id: params.donorId,
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
    });
    return this.recurringDonationRepo.save(row);
  }

  /**
   * When a non-Stripe donation linked to a subscription is completed,
   * record an installment under that subscription (idempotent).
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
      return { recorded: false, reason: "Stripe subscription — installments via webhook" };
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
      amount: donation.amount ?? master.amount,
      currency: donation.currency || master.currency || "PKR",
      status: "completed",
      donation_method: donation.donation_method || master.donation_method,
      project_id: donation.project_id || master.project_id,
      campaign_id: donation.campaign_id ?? master.campaign_id,
      donation_type: donation.donation_type || master.donation_type,
      paid_at: new Date(),
      stripe_billing_reason:
        master.initial_donation_id === donationId
          ? "initial_payment"
          : "manual_payment",
    });
    await this.recurringDonationRepo.save(installment);

    if (master.status !== "active") {
      await this.recurringDonationRepo.update(master.id, { status: "active" });
    }

    return { recorded: true };
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
    if (!subscription.donor_id) {
      throw new BadRequestException("Subscription has no donor linked");
    }

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
      donor.company_name ||
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
        email_sent = !!(await this.emailService.sendDonationFailureEmail(
          donation,
        ));
        if (!email_sent) errors.push("Payment link email failed");
      } catch (err: any) {
        errors.push(err?.message || "Payment link email failed");
      }
    }

    if (donor.phone) {
      try {
        whatsapp_sent = !!(await this.whatsAppService.sendAbandonMessage({
          phoneNumber: donor.phone,
          userName: donorName,
          amount: String(amount),
          donationId: donation.id,
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

    return {
      donation_id: donation.id,
      email_sent,
      whatsapp_sent,
      errors,
    };
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
      note: `Installment payment link for ${marker}`,
      manual_recurring_intent: {
        recurring_subscription_id: subscription.id,
        installment_link: true,
      },
    });
    const saved = await this.donationRepository.save(created);
    if (donorRow) saved.donor = donorRow;
    return saved;
  }
}
