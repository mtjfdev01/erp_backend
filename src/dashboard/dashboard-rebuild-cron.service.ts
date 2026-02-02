import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DashboardRebuildService } from './dashboard-rebuild.service';

@Injectable()
export class DashboardRebuildCronService {
  private readonly logger = new Logger(DashboardRebuildCronService.name);

  constructor(private readonly rebuildService: DashboardRebuildService) {}

  /**
   * Nightly rebuild: runs daily at 2:30 AM Asia/Karachi.
   * Rebuilds last 18 months of aggregates from raw donations.
   * Idempotent and safe to run multiple times.
   */
  @Cron('30 2 * * *', {
    name: 'dashboard-rebuild-nightly',
    timeZone: 'Asia/Karachi',
  })
  async handleNightlyRebuild() {
    try {
      this.logger.log('Starting dashboard aggregates nightly rebuild...');
      await this.rebuildService.rebuild();
      this.logger.log('Dashboard aggregates rebuild completed successfully');
    } catch (error: any) {
      this.logger.error(
        `Dashboard rebuild failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
