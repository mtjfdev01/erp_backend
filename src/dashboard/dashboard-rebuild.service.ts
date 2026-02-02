import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Donation } from '../donations/entities/donation.entity';
import { Donor } from '../dms/donor/entities/donor.entity';
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

@Injectable()
export class DashboardRebuildService {
  constructor(
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
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
}
