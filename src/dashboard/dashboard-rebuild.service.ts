import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Donation } from '../donations/entities/donation.entity';
import { Donor } from '../dms/donor/entities/donor.entity';
import {
  DonationBoxDonation,
  CollectionStatus,
} from '../dms/donation_box/donation_box_donation/entities/donation_box_donation.entity';
import {
  DashboardMonthlyAgg,
  DashboardEventAgg,
  DashboardMonthDonorUnique,
  DashboardMonthEvents,
} from './entities';
import { DashboardAggregateService } from './dashboard-aggregate.service';

const COMPLETED_STATUS = 'completed';

/** Rebuild last N months of aggregates from raw donations. */
const REBUILD_MONTHS = 18;

/** Full rebuild: look back this many years for donations / donation box data. */
const FULL_REBUILD_YEARS = 10;

@Injectable()
export class DashboardRebuildService {
  constructor(
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(DonationBoxDonation)
    private readonly donationBoxDonationRepo: Repository<DonationBoxDonation>,
    @InjectRepository(DashboardMonthlyAgg)
    private readonly monthlyAggRepo: Repository<DashboardMonthlyAgg>,
    @InjectRepository(DashboardEventAgg)
    private readonly eventAggRepo: Repository<DashboardEventAgg>,
    @InjectRepository(DashboardMonthDonorUnique)
    private readonly monthDonorRepo: Repository<DashboardMonthDonorUnique>,
    @InjectRepository(DashboardMonthEvents)
    private readonly monthEventsRepo: Repository<DashboardMonthEvents>,
    private readonly aggregateService: DashboardAggregateService,
  ) {}

  /**
   * Rebuild aggregates for the last N months from raw donations.
   * Idempotent: clears affected months then recomputes. Safe to run multiple times.
   */
  async rebuild(): Promise<void> {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCMonth(startDate.getUTCMonth() - REBUILD_MONTHS);
    startDate.setUTCDate(1);
    startDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(now);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    endDate.setUTCDate(0);
    endDate.setUTCHours(23, 59, 59, 999);

    const monthStartDates: Date[] = [];
    for (let i = 0; i <= REBUILD_MONTHS; i++) {
      const d = new Date(startDate);
      d.setUTCMonth(d.getUTCMonth() + i);
      monthStartDates.push(d);
    }

    // Clear aggregates for the rebuild window
    for (const ms of monthStartDates) {
      await this.monthlyAggRepo.delete({ month_start_date: ms });
      await this.monthDonorRepo.delete({ month_start_date: ms });
      await this.eventAggRepo.delete({ month_start_date: ms });
      await this.monthEventsRepo.delete({ month_start_date: ms });
    }

    const donations = await this.donationRepo.find({
      where: {
        status: COMPLETED_STATUS,
        date: Between(startDate, endDate),
      },
      relations: ['donor'],
      order: { date: 'ASC' },
    });

    const monthStarts = new Set<string>();
    for (const d of donations) {
      const ms = this.aggregateService.getMonthStart(
        d.date ? new Date(d.date) : d.created_at,
      );
      monthStarts.add(ms.toISOString().split('T')[0]);
    }

    const monthsToProcess = Array.from(monthStarts).map((s) => new Date(s));

    for (const ms of monthsToProcess) {
      const nextMonth = new Date(ms);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

      const monthDonations = donations.filter((d) => {
        const dDate = d.date ? new Date(d.date) : d.created_at;
        return dDate >= ms && dDate < nextMonth;
      });

      const totals = this.computeTotals(monthDonations);
      const uniqueDonors = new Set(
        monthDonations
          .map((d) => d.donor_id)
          .filter((id): id is number => id != null),
      );
      const eventIds = new Set(
        monthDonations
          .map((d) => d.event_id)
          .filter((id): id is number => id != null),
      );

      await this.monthlyAggRepo.save(
        this.monthlyAggRepo.create({
          month_start_date: ms,
          ...totals,
          total_donors_count: uniqueDonors.size,
          total_donation_box_raised: 0,
          total_donation_box_count: 0,
        }),
      );

      for (const donorId of uniqueDonors) {
        await this.monthDonorRepo.save(
          this.monthDonorRepo.create({
            month_start_date: ms,
            donor_id: donorId,
          }),
        );
      }

      const eventTotals = this.computeEventTotals(monthDonations);
      for (const [eventId, agg] of eventTotals) {
        await this.eventAggRepo.save(
          this.eventAggRepo.create({
            event_id: eventId,
            month_start_date: ms,
            total_event_collection: agg.amount,
            total_donations_count: agg.count,
            total_donors_count: agg.uniqueDonors,
          }),
        );
      }

      for (const eventId of eventIds) {
        await this.monthEventsRepo.save(
          this.monthEventsRepo.create({
            month_start_date: ms,
            event_id: eventId,
          }),
        );
      }
    }
  }

  private computeTotals(
    donations: (Donation & { donor?: Donor | null })[],
  ): Partial<DashboardMonthlyAgg> {
    let total_raised = 0;
    let total_individual_raised = 0;
    let total_csr_raised = 0;
    let total_events_raised = 0;
    let total_online_raised = 0;
    let total_phone_raised = 0;
    let total_corporate_raised = 0;
    let total_event_channel_raised = 0;

    for (const d of donations) {
      const amount =
        (d.paid_amount != null ? Number(d.paid_amount) : 0) ||
        (d.amount != null ? Number(d.amount) : 0);
      if (amount <= 0) continue;

      const channel = this.aggregateService['deriveChannel'](d);
      const donorType = this.aggregateService['deriveDonorType'](d);

      total_raised += amount;
      if (donorType === 'individual') total_individual_raised += amount;
      if (donorType === 'csr') total_csr_raised += amount;
      if (d.event_id != null) total_events_raised += amount;
      if (channel === 'online') total_online_raised += amount;
      if (channel === 'phone') total_phone_raised += amount;
      if (channel === 'corporate') total_corporate_raised += amount;
      if (channel === 'event') total_event_channel_raised += amount;
    }

    return {
      total_raised,
      total_individual_raised,
      total_csr_raised,
      total_events_raised,
      total_online_raised,
      total_phone_raised,
      total_corporate_raised,
      total_event_channel_raised,
      total_donations_count: donations.length,
    };
  }

  private computeEventTotals(
    donations: (Donation & { donor?: Donor | null })[],
  ): Map<number, { amount: number; count: number; uniqueDonors: number }> {
    const map = new Map<
      number,
      { amount: number; count: number; donorIds: Set<number> }
    >();

    for (const d of donations) {
      if (d.event_id == null) continue;
      const amount =
        (d.paid_amount != null ? Number(d.paid_amount) : 0) ||
        (d.amount != null ? Number(d.amount) : 0);
      if (amount <= 0) continue;

      const existing = map.get(d.event_id) || {
        amount: 0,
        count: 0,
        donorIds: new Set<number>(),
      };
      existing.amount += amount;
      existing.count += 1;
      if (d.donor_id != null) existing.donorIds.add(d.donor_id);
      map.set(d.event_id, existing);
    }

    const result = new Map<
      number,
      { amount: number; count: number; uniqueDonors: number }
    >();
    for (const [eventId, v] of map) {
      result.set(eventId, {
        amount: v.amount,
        count: v.count,
        uniqueDonors: v.donorIds.size,
      });
    }
    return result;
  }

  /**
   * One-time full rebuild: empty all aggregation tables, then recalculate from
   * donations (with donor), donation_box_donations (verified/deposited).
   * Use this for initial backfill or to reset aggregates.
   */
  async fullRebuild(): Promise<void> {
    // 1. Empty all aggregation tables (no FK between them; order does not matter)
    await this.monthEventsRepo.createQueryBuilder().delete().execute();
    await this.eventAggRepo.createQueryBuilder().delete().execute();
    await this.monthDonorRepo.createQueryBuilder().delete().execute();
    await this.monthlyAggRepo.createQueryBuilder().delete().execute();

    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - FULL_REBUILD_YEARS);
    startDate.setUTCDate(1);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    endDate.setUTCDate(0);
    endDate.setUTCHours(23, 59, 59, 999);

    // 2. Load all completed donations in range (with donor)
    const donations = await this.donationRepo.find({
      where: {
        status: COMPLETED_STATUS,
        date: Between(startDate, endDate),
      },
      relations: ['donor'],
      order: { date: 'ASC' },
    });

    // 3. Load donation box donations (verified/deposited) in range
    const boxRows = await this.donationBoxDonationRepo
      .createQueryBuilder('d')
      .select("DATE_TRUNC('month', d.collection_date)", 'month_start')
      .addSelect('SUM(d.collection_amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('d.collection_date >= :start', { start: startDate })
      .andWhere('d.collection_date <= :end', { end: endDate })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [CollectionStatus.VERIFIED, CollectionStatus.DEPOSITED],
      })
      .groupBy("DATE_TRUNC('month', d.collection_date)")
      .getRawMany<{ month_start: string; total: string; count: string }>();

    const donationBoxByMonth = new Map<string, { amount: number; count: number }>();
    for (const row of boxRows) {
      const ms = new Date(row.month_start);
      const key = ms.toISOString().split('T')[0];
      donationBoxByMonth.set(key, {
        amount: Number(row.total ?? 0),
        count: Number(row.count ?? 0),
      });
    }

    // 4. All month keys from donations and donation box
    const monthKeys = new Set<string>();
    for (const d of donations) {
      const ms = this.aggregateService.getMonthStart(
        d.date ? new Date(d.date) : d.created_at,
      );
      monthKeys.add(ms.toISOString().split('T')[0]);
    }
    for (const key of donationBoxByMonth.keys()) monthKeys.add(key);
    const monthsToProcess = Array.from(monthKeys).map((s) => new Date(s)).sort((a, b) => a.getTime() - b.getTime());

    for (const ms of monthsToProcess) {
      const nextMonth = new Date(ms);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const monthKey = ms.toISOString().split('T')[0];

      const monthDonations = donations.filter((d) => {
        const dDate = d.date ? new Date(d.date) : d.created_at;
        return dDate >= ms && dDate < nextMonth;
      });

      const totals = this.computeTotals(monthDonations);
      const uniqueDonors = new Set(
        monthDonations
          .map((d) => d.donor_id)
          .filter((id): id is number => id != null),
      );
      const eventIds = new Set(
        monthDonations
          .map((d) => d.event_id)
          .filter((id): id is number => id != null),
      );
      const boxForMonth = donationBoxByMonth.get(monthKey) ?? { amount: 0, count: 0 };

      await this.monthlyAggRepo.save(
        this.monthlyAggRepo.create({
          month_start_date: ms,
          ...totals,
          total_donors_count: uniqueDonors.size,
          total_donation_box_raised: boxForMonth.amount,
          total_donation_box_count: boxForMonth.count,
        }),
      );

      for (const donorId of uniqueDonors) {
        await this.monthDonorRepo.save(
          this.monthDonorRepo.create({
            month_start_date: ms,
            donor_id: donorId,
          }),
        );
      }

      const eventTotals = this.computeEventTotals(monthDonations);
      for (const [eventId, agg] of eventTotals) {
        await this.eventAggRepo.save(
          this.eventAggRepo.create({
            event_id: eventId,
            month_start_date: ms,
            total_event_collection: agg.amount,
            total_donations_count: agg.count,
            total_donors_count: agg.uniqueDonors,
          }),
        );
      }

      for (const eventId of eventIds) {
        await this.monthEventsRepo.save(
          this.monthEventsRepo.create({
            month_start_date: ms,
            event_id: eventId,
          }),
        );
      }
    }
  }
}
