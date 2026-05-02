import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Donation } from "src/donations/entities/donation.entity";
import { DonorAuthModule } from "src/donor_auth/donor-auth.module";
import { DonorPortalDonationsController } from "./donor-portal-donations.controller";
import { DonorPortalDonationsService } from "./donor-portal-donations.service";
import { ProgressTracker } from "src/progress_tracking/progress_trackers/progress_tracker.entity";
import { ProgressTrackerStep } from "src/progress_tracking/progress_trackers/progress_tracker_step.entity";
import { ProgressStepEvidence } from "src/progress_tracking/progress_trackers/progress_step_evidence.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Donation,
      ProgressTracker,
      ProgressTrackerStep,
      ProgressStepEvidence,
    ]),
    DonorAuthModule,
  ],
  controllers: [DonorPortalDonationsController],
  providers: [DonorPortalDonationsService],
})
export class DonorPortalModule {}
