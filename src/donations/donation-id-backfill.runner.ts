import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DonationIdBackfillService } from "./donation-id-backfill.service";

@Injectable()
export class DonationIdBackfillRunner implements OnModuleInit {
  private readonly logger = new Logger(DonationIdBackfillRunner.name);

  constructor(private readonly backfill: DonationIdBackfillService) {}

  async onModuleInit() {
    setTimeout(async () => {
      try {
        await this.backfill.backfillMissingDonationIds();
      } catch (error: any) {
        this.logger.error(
          `donation_public_id backfill failed: ${error?.message || error}`,
          error?.stack || undefined,
        );
      }
    }, 6000);
  }
}
