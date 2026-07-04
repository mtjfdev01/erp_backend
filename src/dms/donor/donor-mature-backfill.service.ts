import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Donor } from "./entities/donor.entity";
import { Donation } from "../../donations/entities/donation.entity";

@Injectable()
export class DonorMatureBackfillService {
  private readonly logger = new Logger(DonorMatureBackfillService.name);
  private ran = false;

  constructor(
    @InjectRepository(Donor)
    private readonly donorRepository: Repository<Donor>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
  ) {}

  /**
   * One-time backfill: mark donors with at least one completed donation as mature.
   * Enable with DONOR_MATURE_BACKFILL_ONCE=true, then disable after a successful run.
   */
  async runOnceIfEnabled(): Promise<void> {
    if (this.ran) return;
    this.ran = true;

    const enabled =
      String(process.env.DONOR_MATURE_BACKFILL_ONCE || "").toLowerCase() ===
      "true";
    if (!enabled) {
      this.logger.log(
        "Mature donor backfill skipped (set DONOR_MATURE_BACKFILL_ONCE=true to enable)",
      );
      return;
    }

    this.logger.log(
      "Mature donor backfill started — donors with at least one completed donation",
    );

    const rows = await this.donationRepository
      .createQueryBuilder("donation")
      .select("DISTINCT donation.donor_id", "donor_id")
      .where("donation.donor_id IS NOT NULL")
      .andWhere("donation.is_archived = :archived", { archived: false })
      .andWhere("LOWER(donation.status) = :status", { status: "completed" })
      .getRawMany();

    const donorIds = rows
      .map((row) => Number(row.donor_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (donorIds.length === 0) {
      this.logger.log("Mature donor backfill finished — no donors to update");
      return;
    }

    const result = await this.donorRepository
      .createQueryBuilder()
      .update(Donor)
      .set({ is_mature_donor: true })
      .where("id IN (:...donorIds)", { donorIds })
      .andWhere("(is_mature_donor IS NULL OR is_mature_donor = :falseVal)", {
        falseVal: false,
      })
      .execute();

    const totalMature = await this.donorRepository.count({
      where: { is_mature_donor: true, is_archived: false },
    });

    this.logger.log(
      `Mature donor backfill finished — updated ${result.affected ?? 0} donor(s); ${totalMature} mature donor(s) in total`,
    );
    this.logger.warn(
      "IMPORTANT: disable DONOR_MATURE_BACKFILL_ONCE after successful run.",
    );
  }
}
