import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RecurringDonation } from "./entities/recurring-donation.entity";
import { Donation } from "../entities/donation.entity";
import { Donor } from "src/dms/donor/entities/donor.entity";

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

    const total = await qb.clone().getCount();

    qb.select([
      "rd.id AS id",
      "rd.initial_donation_id AS initial_donation_id",
      "rd.donor_id AS donor_id",
      "rd.stripe_subscription_id AS stripe_subscription_id",
      "rd.stripe_customer_id AS stripe_customer_id",
      "rd.billing_interval AS billing_interval",
      "rd.billing_interval_count AS billing_interval_count",
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
}
