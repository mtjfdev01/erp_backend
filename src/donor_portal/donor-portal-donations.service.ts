import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Donation } from "src/donations/entities/donation.entity";
import { ProgressTracker } from "src/progress_tracking/progress_trackers/progress_tracker.entity";
import { ProgressTrackerStep } from "src/progress_tracking/progress_trackers/progress_tracker_step.entity";

@Injectable()
export class DonorPortalDonationsService {
  constructor(
    @InjectRepository(Donation)
    private readonly donationsRepo: Repository<Donation>,
    @InjectRepository(ProgressTracker)
    private readonly trackersRepo: Repository<ProgressTracker>,
    @InjectRepository(ProgressTrackerStep)
    private readonly stepsRepo: Repository<ProgressTrackerStep>,
  ) {}

  async listForDonor(donorId: number) {
    // Simple donations only (exclude in_kind)
    const qb = this.donationsRepo
      .createQueryBuilder("donation")
      .leftJoin(
        ProgressTracker,
        "progress_tracker",
        "progress_tracker.donation_id = donation.id AND progress_tracker.is_archived = false",
      )
      .addSelect("progress_tracker.id", "progress_tracker_id")
      .addSelect("progress_tracker.public_tracking_token", "progress_tracker_token")
      .where("donation.donor_id = :donorId", { donorId })
      .andWhere("COALESCE(donation.donation_method,'') != 'in_kind'")
      .orderBy("donation.created_at", "DESC");

    // Return raw+entity-like shape
    const rows = await qb.getRawAndEntities();
    return rows.entities.map((d, idx) => ({
      ...d,
      progress_tracker: rows.raw[idx]?.progress_tracker_id
        ? {
            id: Number(rows.raw[idx].progress_tracker_id),
            public_tracking_token: rows.raw[idx].progress_tracker_token || null,
          }
        : null,
    }));
  }

  async getForDonor(donorId: number, donationId: number) {
    const qb = this.donationsRepo
      .createQueryBuilder("donation")
      .leftJoinAndSelect("donation.donor", "donor")
      .leftJoin(
        ProgressTracker,
        "progress_tracker",
        "progress_tracker.donation_id = donation.id AND progress_tracker.is_archived = false",
      )
      .addSelect("progress_tracker.id", "progress_tracker_id")
      .addSelect("progress_tracker.public_tracking_token", "progress_tracker_token")
      .where("donation.id = :id", { id: donationId })
      .andWhere("donation.donor_id = :donorId", { donorId })
      .andWhere("COALESCE(donation.donation_method,'') != 'in_kind'");

    const result = await qb.getRawAndEntities();
    const d = result.entities?.[0];
    if (!d) throw new NotFoundException("Donation not found");
    const raw = result.raw?.[0] || {};
    return {
      ...d,
      progress_tracker: raw?.progress_tracker_id
        ? {
            id: Number(raw.progress_tracker_id),
            public_tracking_token: raw.progress_tracker_token || null,
          }
        : null,
    };
  }

  async getTrackingForDonation(donorId: number, donationId: number) {
    // Ensure donation belongs to this donor and is not in-kind
    await this.getForDonor(donorId, donationId);

    const tracker = await this.trackersRepo.findOne({
      where: { donation_id: donationId, is_archived: false } as any,
    });
    if (!tracker) throw new NotFoundException("No tracker for this donation");

    // Donor should only see donor-visible steps
    const steps = await this.stepsRepo.find({
      where: {
        tracker_id: tracker.id,
        is_archived: false as any,
        donor_visible: true as any,
      } as any,
      relations: ["evidence"],
      order: { step_order: "ASC" } as any,
    });

    return {
      tracker: {
        id: tracker.id,
        overall_status: tracker.overall_status,
        public_tracking_token: tracker.public_tracking_token || null,
      },
      steps,
    };
  }
}

