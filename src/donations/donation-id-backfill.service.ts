import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Donation } from "./entities/donation.entity";
import { generateDonationPublicIdCandidate } from "./donation-id.util";

@Injectable()
export class DonationIdBackfillService {
  private readonly logger = new Logger(DonationIdBackfillService.name);

  constructor(
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
  ) {}

  /** Assign donation_public_id to every row that is still null (one-time / heal). */
  async backfillMissingDonationIds(): Promise<{ updated: number }> {
    const missing = await this.donationRepository
      .createQueryBuilder("d")
      .select(["d.id"])
      .where("d.donation_public_id IS NULL")
      .getMany();

    if (!missing.length) {
      this.logger.log("donation_public_id backfill: nothing to do");
      return { updated: 0 };
    }

    this.logger.log(
      `donation_public_id backfill: assigning for ${missing.length} donation(s)`,
    );

    let updated = 0;
    for (const row of missing) {
      const code = await this.generateUniqueDonationPublicId();
      await this.donationRepository.update(row.id, {
        donation_public_id: code,
      });
      updated += 1;
    }

    this.logger.log(`donation_public_id backfill: done (${updated} updated)`);
    return { updated };
  }

  private async generateUniqueDonationPublicId(): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = generateDonationPublicIdCandidate();
      const exists = await this.donationRepository.findOne({
        where: { donation_public_id: code },
        select: ["id"],
      });
      if (!exists) return code;
    }
    throw new Error(
      "Failed to generate unique donation_public_id during backfill",
    );
  }
}
