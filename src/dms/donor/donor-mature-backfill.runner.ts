import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DonorMatureBackfillService } from "./donor-mature-backfill.service";

@Injectable()
export class DonorMatureBackfillRunner implements OnModuleInit {
  private readonly logger = new Logger(DonorMatureBackfillRunner.name);

  constructor(
    private readonly donorMatureBackfill: DonorMatureBackfillService,
  ) {}

  async onModuleInit() {
    setTimeout(async () => {
      try {
        await this.donorMatureBackfill.runOnceIfEnabled();
      } catch (error: any) {
        this.logger.error(
          `Mature donor backfill failed: ${error?.message || error}`,
          error?.stack || undefined,
        );
      }
    }, 7000);
  }
}
