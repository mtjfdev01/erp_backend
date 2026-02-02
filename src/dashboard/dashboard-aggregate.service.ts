import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Donation } from '../donations/entities/donation.entity';
import { Donor } from '../dms/donor/entities/donor.entity';
import {
  DashboardMonthlyAgg,
  DashboardEventAgg,
  DashboardMonthDonorUnique,
  DashboardMonthEvents,
} from './entities';

/** Donation status considered "COMPLETED" for aggregation */
const COMPLETED_STATUS = 'completed';

/** Donation statuses considered "REVERSED" (subtract from aggregates) */
const REVERSED_STATUSES = ['refunded', 'reversed'];

/** Channel derivation: online | phone | event | corporate */
type Channel = 'online' | 'phone' | 'event' | 'corporate';

@Injectable()
export class DashboardAggregateService {
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
    if (donation.event_id != null) return 'event';
    const donorType = (donation.donor as Donor)?.donor_type?.toLowerCase?.();
    if (donorType === 'csr') return 'corporate';
    const method = (donation.donation_method || '').toLowerCase();
    const source = (donation.donation_source || '').toLowerCase();
    if (method.includes('phone') || source.includes('phone')) return 'phone';
    return 'online';
  }

  /**
   * Derives donor type: individual | csr.
   */
  private deriveDonorType(
    donation: Donation & { donor?: Donor | null },
  ): 'individual' | 'csr' {
    const donorType = (donation.donor as Donor)?.donor_type?.toLowerCase?.();
    return donorType === 'csr' ? 'csr' : 'individual';
  }

  /**
   * Gets effective amount for completed donation (paid_amount or amount).
   */
  private getAmount(donation: Donation): number {
    const paid = donation.paid_amount != null ? Number(donation.paid_amount) : 0;
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
      relations: ['donor'],
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
          total_donations_count: 0,
          total_donors_count: 0,
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
            (donorType === 'individual' ? amount : 0),
          total_csr_raised:
            Number(monthly.total_csr_raised) +
            (donorType === 'csr' ? amount : 0),
          total_events_raised:
            Number(monthly.total_events_raised) +
            (donation.event_id != null ? amount : 0),
          total_online_raised:
            Number(monthly.total_online_raised) +
            (channel === 'online' ? amount : 0),
          total_phone_raised:
            Number(monthly.total_phone_raised) +
            (channel === 'phone' ? amount : 0),
          total_corporate_raised:
            Number(monthly.total_corporate_raised) +
            (channel === 'corporate' ? amount : 0),
          total_event_channel_raised:
            Number(monthly.total_event_channel_raised) +
            (channel === 'event' ? amount : 0),
          total_donations_count: currDonations,
        },
      );

      // Distinct donors: try insert (month_start_date, donor_id)
      // If insert succeeds (no conflict), increment total_donors_count.
      // NOTE: donors_count decrement on reversal is NOT done here; nightly rebuild corrects it.
      let donorInserted = false;
      if (donation.donor_id != null) {
        try {
          await monthDonorRepo.insert({
            month_start_date: monthStart,
            donor_id: donation.donor_id,
          });
          donorInserted = true;
        } catch (e: any) {
          // Unique violation = donor already counted this month, ignore
          if (e?.code !== '23505') throw e;
        }
      }

      if (donorInserted) {
        const updated = await monthlyRepo.findOne({
          where: { month_start_date: monthStart },
        });
        await monthlyRepo.update(
          { month_start_date: monthStart },
          {
            total_donors_count:
              Number(updated?.total_donors_count ?? 0) + 1,
          },
        );
      }

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
            total_donations_count:
              Number(eventAgg.total_donations_count) + 1,
          },
        );

        // Insert month→event mapping (ignore conflict)
        try {
          await monthEventsRepo.insert({
            month_start_date: monthStart,
            event_id: donation.event_id,
          });
        } catch (e: any) {
          if (e?.code !== '23505') throw e;
        }
      }
    });
  }

  /**
   * Event-driven: apply when donation is reversed/refunded.
   * Subtracts amounts and decrements donation count.
   * NOTE: total_donors_count is NOT decremented here; the nightly rebuild job
   * recomputes it correctly via COUNT(DISTINCT donor_id). Realtime decrement
   * would require knowing if the donor had other donations that month.
   */
  async applyDonationReversed(donationId: number): Promise<void> {
    const donation = await this.donationRepo.findOne({
      where: { id: donationId },
      relations: ['donor'],
    });

    if (!donation) return;

    const status = (donation.status || '').toLowerCase();
    if (!REVERSED_STATUSES.includes(status)) {
      return;
    }

    const amount = this.getAmount(donation);
    const monthStart = this.getMonthStart(this.getCompletionDate(donation));
    const channel = this.deriveChannel(donation);
    const donorType = this.deriveDonorType(donation);

    await this.dataSource.transaction(async (manager) => {
      const monthlyRepo = manager.getRepository(DashboardMonthlyAgg);
      const eventAggRepo = manager.getRepository(DashboardEventAgg);

      const monthly = await monthlyRepo.findOne({
        where: { month_start_date: monthStart },
      });

      if (!monthly) return;

      const newRaised = Math.max(0, Number(monthly.total_raised) - amount);
      const newDonations = Math.max(
        0,
        Number(monthly.total_donations_count) - 1,
      );

      await monthlyRepo.update(
        { month_start_date: monthStart },
        {
          total_raised: newRaised,
          total_individual_raised: Math.max(
            0,
            Number(monthly.total_individual_raised) -
              (donorType === 'individual' ? amount : 0),
          ),
          total_csr_raised: Math.max(
            0,
            Number(monthly.total_csr_raised) -
              (donorType === 'csr' ? amount : 0),
          ),
          total_events_raised: Math.max(
            0,
            Number(monthly.total_events_raised) -
              (donation.event_id != null ? amount : 0),
          ),
          total_online_raised: Math.max(
            0,
            Number(monthly.total_online_raised) -
              (channel === 'online' ? amount : 0),
          ),
          total_phone_raised: Math.max(
            0,
            Number(monthly.total_phone_raised) -
              (channel === 'phone' ? amount : 0),
          ),
          total_corporate_raised: Math.max(
            0,
            Number(monthly.total_corporate_raised) -
              (channel === 'corporate' ? amount : 0),
          ),
          total_event_channel_raised: Math.max(
            0,
            Number(monthly.total_event_channel_raised) -
              (channel === 'event' ? amount : 0),
          ),
          total_donations_count: newDonations,
          // total_donors_count: left unchanged - nightly rebuild corrects it
        },
      );

      if (donation.event_id != null) {
        const eventAgg = await eventAggRepo.findOne({
          where: {
            event_id: donation.event_id,
            month_start_date: monthStart,
          },
        });

        if (eventAgg) {
          await eventAggRepo.update(
            {
              event_id: donation.event_id,
              month_start_date: monthStart,
            },
            {
              total_event_collection: Math.max(
                0,
                Number(eventAgg.total_event_collection) - amount,
              ),
              total_donations_count: Math.max(
                0,
                Number(eventAgg.total_donations_count) - 1,
              ),
            },
          );
        }
      }
    });
  }
}
