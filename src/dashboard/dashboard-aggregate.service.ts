import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, Between } from "typeorm";
import { Donation } from "../donations/entities/donation.entity";
import { Donor } from "../dms/donor/entities/donor.entity";
import { DonationBoxDonation } from "../dms/donation_box/donation_box_donation/entities/donation_box_donation.entity";
import { DashboardMonthDonorUnique } from "./entities/dashboard_month_donor_unique.entity";
import {
  DashboardMonthlyAgg,
  DashboardEventAgg,
  DashboardMonthEvents,
  DashboardDonorTotal,
  DashboardDonorMonthlyCount,
  DashboardDonorSeen,
} from "./entities";

/** Donation status considered "COMPLETED" for aggregation */
const COMPLETED_STATUS = "completed";

/** Channel derivation: online | phone | event | corporate */
type Channel = "online" | "phone" | "event" | "corporate";

@Injectable()
export class DashboardAggregateService {
  constructor(
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(DonationBoxDonation)
    private readonly donationBoxDonationRepo: Repository<DonationBoxDonation>,
    @InjectRepository(DashboardMonthlyAgg)
    private readonly monthlyAggRepo: Repository<DashboardMonthlyAgg>,
    @InjectRepository(DashboardEventAgg)
    private readonly eventAggRepo: Repository<DashboardEventAgg>,
    @InjectRepository(DashboardDonorTotal)
    private readonly donorTotalRepo: Repository<DashboardDonorTotal>,
    @InjectRepository(DashboardDonorMonthlyCount)
    private readonly donorMonthlyRepo: Repository<DashboardDonorMonthlyCount>,
    @InjectRepository(DashboardDonorSeen)
    private readonly donorSeenRepo: Repository<DashboardDonorSeen>,
    @InjectRepository(DashboardMonthEvents)
    private readonly monthEventsRepo: Repository<DashboardMonthEvents>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns first day of month in UTC (e.g., 2025-06-18 -> 2025-06-01).
   */
  getMonthStart(date: Date): Date {
    const d = new Date(date);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Derives channel from donation metadata.
   * Uses: event_id, donation_method, donation_source, donor_type.
   */
  private deriveChannel(
    donation: Donation & { donor?: Donor | null },
  ): Channel {
    if (donation.event_id != null) return "event";
    const donorType = (donation.donor as Donor)?.donor_type?.toLowerCase?.();
    if (donorType === "csr") return "corporate";
    const method = (donation.donation_method || "").toLowerCase();
    const source = (donation.donation_source || "").toLowerCase();
    if (method.includes("phone") || source.includes("phone")) return "phone";
    return "online";
  }

  /**
   * Derives donor type: individual | csr.
   */
  private deriveDonorType(
    donation: Donation & { donor?: Donor | null },
  ): "individual" | "csr" {
    const donorType = (donation.donor as Donor)?.donor_type?.toLowerCase?.();
    return donorType === "csr" ? "csr" : "individual";
  }

  /**
   * Gets effective amount for completed donation (paid_amount or amount).
   */
  private getAmount(donation: Donation): number {
    const paid =
      donation.paid_amount != null ? Number(donation.paid_amount) : 0;
    const amt = donation.amount != null ? Number(donation.amount) : 0;
    return paid > 0 ? paid : amt;
  }

  /**
   * Gets completion date for donation (date or created_at).
   */
  private getCompletionDate(donation: Donation): Date {
    if (donation.date) return new Date(donation.date);
    return donation.created_at ? new Date(donation.created_at) : new Date();
  }

  /**
   * Event-driven: apply donation when status becomes COMPLETED.
   * All updates run in a single DB transaction.
   */
  async applyDonationCompleted(donationId: number): Promise<void> {
    const donation = await this.donationRepo.findOne({
      where: { id: donationId },
      relations: ["donor"],
    });

    if (!donation || donation.status !== COMPLETED_STATUS) {
      return;
    }

    const amount = this.getAmount(donation);
    const monthStart = this.getMonthStart(this.getCompletionDate(donation));
    const channel = this.deriveChannel(donation);
    const donorType = this.deriveDonorType(donation);

    await this.dataSource.transaction(async (manager) => {
      const monthlyRepo = manager.getRepository(DashboardMonthlyAgg);
      const eventAggRepo = manager.getRepository(DashboardEventAgg);
      const monthDonorRepo = manager.getRepository(DashboardMonthDonorUnique);
      const monthEventsRepo = manager.getRepository(DashboardMonthEvents);

      // Upsert monthly agg (create with zeros if missing)
      let monthly = await monthlyRepo.findOne({
        where: { month_start_date: monthStart },
      });

      if (!monthly) {
        monthly = monthlyRepo.create({
          month_start_date: monthStart,
          total_raised: 0,
          total_individual_raised: 0,
          total_csr_raised: 0,
          total_events_raised: 0,
          total_online_raised: 0,
          total_phone_raised: 0,
          total_corporate_raised: 0,
          total_event_channel_raised: 0,
          total_campaigns_raised: 0,
          total_donations_count: 0,
          total_online_donations_count: 0,
          total_events_donations_count: 0,
          total_csr_donations_count: 0,
          total_individual_donations_count: 0,
          total_campaigns_donations_count: 0,
          total_donation_box_raised: 0,
          total_donation_box_count: 0,
        });
        await monthlyRepo.save(monthly);
      }

      // Increment totals
      const currRaised = Number(monthly.total_raised) + amount;
      const currDonations = Number(monthly.total_donations_count) + 1;

      await monthlyRepo.update(
        { month_start_date: monthStart },
        {
          total_raised: currRaised,
          total_individual_raised:
            Number(monthly.total_individual_raised) +
            (donorType === "individual" ? amount : 0),
          total_csr_raised:
            Number(monthly.total_csr_raised) +
            (donorType === "csr" ? amount : 0),
          total_events_raised:
            Number(monthly.total_events_raised) +
            (donation.event_id != null ? amount : 0),
          total_online_raised:
            Number(monthly.total_online_raised) +
            (channel === "online" ? amount : 0),
          total_phone_raised:
            Number(monthly.total_phone_raised) +
            (channel === "phone" ? amount : 0),
          total_corporate_raised:
            Number(monthly.total_corporate_raised) +
            (channel === "corporate" ? amount : 0),
          total_event_channel_raised:
            Number(monthly.total_event_channel_raised) +
            (channel === "event" ? amount : 0),
          total_campaigns_raised:
            Number(monthly.total_campaigns_raised ?? 0) +
            (donation.campaign_id != null ? amount : 0),
          total_donations_count: currDonations,
          total_online_donations_count:
            Number(monthly.total_online_donations_count ?? 0) +
            (channel === "online" ? 1 : 0),
          total_events_donations_count:
            Number(monthly.total_events_donations_count ?? 0) +
            (donation.event_id != null ? 1 : 0),
          total_csr_donations_count:
            Number(monthly.total_csr_donations_count ?? 0) +
            (donorType === "csr" ? 1 : 0),
          total_individual_donations_count:
            Number(monthly.total_individual_donations_count ?? 0) +
            (donorType === "individual" ? 1 : 0),
          total_campaigns_donations_count:
            Number(monthly.total_campaigns_donations_count ?? 0) +
            (donation.campaign_id != null ? 1 : 0),
        },
      );

      // Donor counts are maintained independently of donation status.

      // Event aggregates
      if (donation.event_id != null) {
        let eventAgg = await eventAggRepo.findOne({
          where: {
            event_id: donation.event_id,
            month_start_date: monthStart,
          },
        });

        if (!eventAgg) {
          eventAgg = eventAggRepo.create({
            event_id: donation.event_id,
            month_start_date: monthStart,
            total_event_collection: 0,
            total_donations_count: 0,
            total_donors_count: 0,
          });
          await eventAggRepo.save(eventAgg);
        }

        await eventAggRepo.update(
          {
            event_id: donation.event_id,
            month_start_date: monthStart,
          },
          {
            total_event_collection:
              Number(eventAgg.total_event_collection) + amount,
            total_donations_count: Number(eventAgg.total_donations_count) + 1,
          },
        );

        // Insert month→event mapping (ignore conflict)
        try {
          await monthEventsRepo.insert({
            month_start_date: monthStart,
            event_id: donation.event_id,
          });
        } catch (e: any) {
          if (e?.code !== "23505") throw e;
        }
      }
    });
  }

  /**
   * Donor count is maintained irrespective of donation status.
   * We count donors who exist because they created at least one donation attempt.
   * Called from DonorService.register and autoRegisterFromDonation callers.
   */
  async applyDonorSeen(donorId: number, at: Date = new Date()): Promise<void> {
    if (!donorId) return;
    const monthStart = this.getMonthStart(at);

    await this.dataSource.transaction(async (manager) => {
      const monthDonorRepo = manager.getRepository(DashboardMonthDonorUnique);
      const donorSeenRepo = manager.getRepository(DashboardDonorSeen);
      const donorTotalRepo = manager.getRepository(DashboardDonorTotal);
      const donorMonthlyRepo = manager.getRepository(DashboardDonorMonthlyCount);

      // Total donors (all time) — unique by donor_id
      let totalInserted = false;
      try {
        await donorSeenRepo.insert({ donor_id: donorId });
        totalInserted = true;
      } catch (e: any) {
        if (e?.code !== "23505") throw e;
      }
      if (totalInserted) {
        const existing = await donorTotalRepo.findOne({ where: { id: 1 } });
        if (!existing) {
          await donorTotalRepo.save(
            donorTotalRepo.create({ id: 1, total_donors_count: 1 }),
          );
        } else {
          await donorTotalRepo.update(
            { id: 1 },
            { total_donors_count: Number(existing.total_donors_count ?? 0) + 1 },
          );
        }
      }

      // Insert donor-month uniqueness; if new, increment total_donors_count
      let inserted = false;
      try {
        await monthDonorRepo.insert({ month_start_date: monthStart, donor_id: donorId });
        inserted = true;
      } catch (e: any) {
        if (e?.code !== "23505") throw e;
      }
      if (inserted) {
        const existingMonth = await donorMonthlyRepo.findOne({
          where: { month_start_date: monthStart },
        });
        if (!existingMonth) {
          await donorMonthlyRepo.save(
            donorMonthlyRepo.create({ month_start_date: monthStart, donors_count: 1 }),
          );
        } else {
          await donorMonthlyRepo.update(
            { month_start_date: monthStart },
            { donors_count: Number(existingMonth.donors_count ?? 0) + 1 },
          );
        }
      }
    });
  }

  /**
   * Donation-box collections aggregation (verified/deposited count toward totals).
   * Called from DonationBoxDonationService on status transitions.
   */
  async applyDonationBoxCounted(collectionId: number): Promise<void> {
    const row = await this.donationBoxDonationRepo.findOne({
      where: { id: collectionId },
    });
    if (!row) return;

    const status = (row.status || "").toString().toLowerCase();
    if (status !== "verified" && status !== "deposited") return;

    const amount = Number(row.collection_amount) || 0;
    const date = row.collection_date ? new Date(row.collection_date) : new Date();
    const monthStart = this.getMonthStart(date);

    await this.dataSource.transaction(async (manager) => {
      const monthlyRepo = manager.getRepository(DashboardMonthlyAgg);
      let monthly = await monthlyRepo.findOne({ where: { month_start_date: monthStart } });
      if (!monthly) {
        monthly = monthlyRepo.create({
          month_start_date: monthStart,
          total_raised: 0,
          total_individual_raised: 0,
          total_csr_raised: 0,
          total_events_raised: 0,
          total_online_raised: 0,
          total_phone_raised: 0,
          total_corporate_raised: 0,
          total_event_channel_raised: 0,
          total_campaigns_raised: 0,
          total_donations_count: 0,
          total_online_donations_count: 0,
          total_events_donations_count: 0,
          total_csr_donations_count: 0,
          total_individual_donations_count: 0,
          total_campaigns_donations_count: 0,
          total_donation_box_raised: 0,
          total_donation_box_count: 0,
        }) as DashboardMonthlyAgg;
        await monthlyRepo.save(monthly);
      }

      await monthlyRepo.update(
        { month_start_date: monthStart },
        {
          total_donation_box_raised:
            Number(monthly.total_donation_box_raised ?? 0) + amount,
          total_donation_box_count:
            Number(monthly.total_donation_box_count ?? 0) + 1,
        },
      );
    });
  }

  async applyDonationBoxUncounted(collectionId: number): Promise<void> {
    const row = await this.donationBoxDonationRepo.findOne({
      where: { id: collectionId },
    });
    if (!row) return;

    const amount = Number(row.collection_amount) || 0;
    const date = row.collection_date ? new Date(row.collection_date) : new Date();
    const monthStart = this.getMonthStart(date);

    await this.dataSource.transaction(async (manager) => {
      const monthlyRepo = manager.getRepository(DashboardMonthlyAgg);
      const monthly = await monthlyRepo.findOne({ where: { month_start_date: monthStart } });
      if (!monthly) return;
      await monthlyRepo.update(
        { month_start_date: monthStart },
        {
          total_donation_box_raised: Math.max(
            0,
            Number(monthly.total_donation_box_raised ?? 0) - amount,
          ),
          total_donation_box_count: Math.max(
            0,
            Number(monthly.total_donation_box_count ?? 0) - 1,
          ),
        },
      );
    });
  }

  /**
   * Get date range (start inclusive, end exclusive) for fundraising overview.
   * If months is set, use last N months; else if year is set use that year; else last 12 months.
   */
  private getFundraisingDateRange(query: { year?: number; months?: number }): {
    start: Date;
    end: Date;
  } {
    const now = new Date();
    let start: Date;
    let end = new Date(now);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    end.setUTCHours(23, 59, 59, 999);

    if (query.months != null) {
      start = new Date(now);
      start.setUTCMonth(start.getUTCMonth() - query.months);
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
    } else if (query.year != null) {
      start = new Date(Date.UTC(query.year, 0, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(query.year, 11, 31, 23, 59, 59, 999));
    } else {
      start = new Date(now);
      start.setUTCMonth(start.getUTCMonth() - 12);
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
    }
    return { start, end };
  }

  /**
   * Fundraising overview: cards (totals by category), cumulative series, and raised-per-month for charts.
   * When donation-level filters are provided, computes directly from the donations table.
   * Otherwise uses precomputed aggregation tables for performance.
   */
  async getFundraisingOverview(query: {
    year?: number;
    months?: number;
    donation_type?: string;
    donation_method?: string;
    ref?: string;
    projects?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    cards: {
      total_donations_amount: number;
      total_donations_count: number;
      total_donors_count: number;
      online_donations_amount: number;
      online_donations_count: number;
      donation_box_amount: number;
      donation_box_count: number;
      csr_amount: number;
      csr_count: number;
      individual_amount: number;
      individual_count: number;
      events_amount: number;
      events_count: number;
      campaigns_amount: number;
      campaigns_count: number;
    };
    cumulative: Array<{
      month: string;
      month_start_date: string;
      total_cumulative: number;
    }>;
    raised_per_month: Array<{
      month: string;
      month_start_date: string;
      online: number;
      phone: number;
      events: number;
      corporate: number;
      donation_box: number;
      campaigns: number;
      total: number;
    }>;
  }> {
    const MONTH_NAMES = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const formatMonth = (d: Date) =>
      MONTH_NAMES[d.getUTCMonth()] + " " + d.getUTCFullYear();

    const { start, end } = this.getFundraisingDateRange(query);

    // ── Stored-only path: use precomputed aggregation tables ──
    // Donation-level filters (method/type/ref/projects/date) are intentionally ignored here.
    // This endpoint is designed to be fast and read from stored month-wise aggregates.

    const monthlyRows = await this.monthlyAggRepo.find({
      where: {
        month_start_date: Between(start, end),
      },
      order: { month_start_date: "ASC" },
    });

    const donationBoxByMonth = new Map<
      string,
      { amount: number; count: number }
    >();
    let donationBoxTotalAmount = 0;
    let donationBoxTotalCount = 0;
    for (const r of monthlyRows) {
      const key = new Date(r.month_start_date).toISOString().slice(0, 7);
      const amount = Number(r.total_donation_box_raised ?? 0);
      const count = Number(r.total_donation_box_count ?? 0);
      if (amount > 0 || count > 0) {
        donationBoxByMonth.set(key, { amount, count });
        donationBoxTotalAmount += amount;
        donationBoxTotalCount += count;
      }
    }

    const totalRow = await this.donorTotalRepo.findOne({ where: { id: 1 } });
    const totalDonorsCount = Number(totalRow?.total_donors_count ?? 0);

    let totalRaised = 0;
    let totalDonationsCount = 0;
    let onlineAmount = 0;
    let csrAmount = 0;
    let individualAmount = 0;
    let eventsAmount = 0;
    let onlineCount = 0;
    let csrCount = 0;
    let individualCount = 0;
    let eventsCount = 0;
    for (const r of monthlyRows) {
      const tr = Number(r.total_raised ?? 0);
      const tc = Number(r.total_donations_count ?? 0);
      totalRaised += tr;
      totalDonationsCount += tc;
      onlineAmount += Number(r.total_online_raised ?? 0);
      csrAmount += Number(r.total_csr_raised ?? 0);
      individualAmount += Number(r.total_individual_raised ?? 0);
      eventsAmount += Number(r.total_events_raised ?? 0);
      onlineCount += Number(r.total_online_donations_count ?? 0);
      csrCount += Number(r.total_csr_donations_count ?? 0);
      individualCount += Number(r.total_individual_donations_count ?? 0);
      eventsCount += Number(r.total_events_donations_count ?? 0);
    }
    const campaignsAmount = monthlyRows.reduce(
      (s, r) => s + Number(r.total_campaigns_raised ?? 0),
      0,
    );
    const campaignsCount = monthlyRows.reduce(
      (s, r) => s + Number(r.total_campaigns_donations_count ?? 0),
      0,
    );

    const cards = {
      total_donations_amount: totalRaised,
      total_donations_count: totalDonationsCount,
      total_donors_count: totalDonorsCount,
      online_donations_amount: onlineAmount,
      online_donations_count: onlineCount,
      donation_box_amount: donationBoxTotalAmount,
      donation_box_count: donationBoxTotalCount,
      csr_amount: csrAmount,
      csr_count: csrCount,
      individual_amount: individualAmount,
      individual_count: individualCount,
      events_amount: eventsAmount,
      events_count: eventsCount,
      campaigns_amount: campaignsAmount,
      campaigns_count: campaignsCount,
    };

    const monthKeys = new Set<string>();
    for (const r of monthlyRows) {
      monthKeys.add(new Date(r.month_start_date).toISOString().slice(0, 7));
    }
    for (const key of donationBoxByMonth.keys()) monthKeys.add(key);
    const sortedMonths = Array.from(monthKeys).sort();

    const raisedPerMonth = sortedMonths.map((key) => {
      const monthStart = new Date(key + "-01");
      const mr = monthlyRows.find(
        (r) => new Date(r.month_start_date).toISOString().slice(0, 7) === key,
      );
      const db = donationBoxByMonth.get(key) ?? { amount: 0, count: 0 };
      const online = mr ? Number(mr.total_online_raised ?? 0) : 0;
      const phone = mr ? Number(mr.total_phone_raised ?? 0) : 0;
      const events = mr ? Number(mr.total_event_channel_raised ?? 0) : 0;
      const corporate = mr ? Number(mr.total_corporate_raised ?? 0) : 0;
      const total = (mr ? Number(mr.total_raised ?? 0) : 0) + db.amount;
      return {
        month: formatMonth(monthStart),
        month_start_date: monthStart.toISOString().slice(0, 10),
        online,
        phone,
        events,
        corporate,
        donation_box: db.amount,
        campaigns: mr ? Number(mr.total_campaigns_raised ?? 0) : 0,
        total,
      };
    });

    let running = 0;
    const cumulative = raisedPerMonth.map((row) => {
      running += row.total;
      return {
        month: row.month,
        month_start_date: row.month_start_date,
        total_cumulative: running,
      };
    });

    return { cards, cumulative, raised_per_month: raisedPerMonth };
  }
}
