import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull, FindOperator } from 'typeorm';
import { Donation } from '../../donations/entities/donation.entity';
import { DonationsService } from '../../donations/donations.service';

@Injectable()
export class DmsCronsService {
  private readonly logger = new Logger(DmsCronsService.name);

  constructor(
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    private readonly donationsService: DonationsService,
  ) {}

  /**
   * Nightly cron - Runs at 1:30 AM every day (Asia/Karachi)
   * Syncs all pending/registered Meezan donations with the Meezan API
   */
  @Cron('30 1 * * *', {
    name: 'meezan-nightly-status-sync',
    timeZone: 'Asia/Karachi',
  })
  async handleNightlyMeezanSync() {
    this.logger.log('⏰ Nightly Meezan status sync cron started');
    await this.syncMeezanDonations();
  }

  /**
   * Core sync logic - Fetches Meezan donations and syncs their status with the Meezan API.
   * Uses DonationsService.getProviderStatus() which handles:
   *   - Querying Meezan API via getMeezanOrderStatusExtended()
   *   - Mapping Meezan orderStatus to donation status via mapMeezanStatusToDonationStatus()
   *   - Updating the donation record if status changed
   *   - Triggering dashboard aggregation on completion/reversal
   *
   * @param allNonCompleted - If true, fetches ALL Meezan donations not yet completed (for manual trigger).
   *                          If false, only fetches pending/registered (for nightly cron).
   * @returns Summary of the sync operation
   */
  async syncMeezanDonations(allNonCompleted = false): Promise<{
    total: number;
    synced: number;
    updated: number;
    failed: number;
    results: any[];
  }> {
    const startTime = Date.now();

    try {
      const statusFilter = allNonCompleted
        ? Not(In(['completed']))
        : In(['pending', 'registered', 'failed', 'cancelled', 'refunded']);

      const label = allNonCompleted ? 'non-completed' : 'pending/registered/failed/cancelled/refunded';

      const pendingMeezanDonations = await this.donationRepository.find({
        where: {
          donation_method: 'meezan',
          status: statusFilter,
          orderId: Not(IsNull()),
        },
        select: ['id', 'orderId', 'status', 'amount', 'created_at'],
        order: { created_at: 'DESC' },
      });

      const total = pendingMeezanDonations.length;
      this.logger.log(`Found ${total} ${label} Meezan donations to sync`);

      if (total === 0) {
        this.logger.log('No pending Meezan donations found. Sync complete.');
        return { total: 0, synced: 0, updated: 0, failed: 0, results: [] };
      }

      let synced = 0;
      let updated = 0;
      let failed = 0;
      const results: any[] = [];

      // Process each donation sequentially to avoid overwhelming the Meezan API
      for (const donation of pendingMeezanDonations) {
        try {
          const result = await this.donationsService.getProviderStatus(donation.id);
          synced++;

          if (result.dbUpdated) {
            updated++;
            this.logger.log(
              `Donation #${donation.id}: ${donation.status} → ${result.donationStatus} (updated)`,
            );
          }

          results.push({
            donationId: donation.id,
            previousStatus: donation.status,
            newStatus: result.donationStatus,
            dbUpdated: result.dbUpdated,
          });
        } catch (error) {
          failed++;
          this.logger.error(
            `Failed to sync donation #${donation.id}: ${error.message}`,
          );
          results.push({
            donationId: donation.id,
            previousStatus: donation.status,
            error: error.message,
          });
        }

        // Small delay between API calls to be respectful to the Meezan API
        if (total > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `Meezan sync complete in ${elapsed}s — Total: ${total}, Synced: ${synced}, Updated: ${updated}, Failed: ${failed}`,
      );

      return { total, synced, updated, failed, results };
    } catch (error) {
      this.logger.error(`Meezan sync cron failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
