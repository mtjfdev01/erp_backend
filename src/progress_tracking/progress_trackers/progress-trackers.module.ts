import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProgressTracker } from "./progress_tracker.entity";
import { ProgressTrackerStep } from "./progress_tracker_step.entity";
import { ProgressStepEvidence } from "./progress_step_evidence.entity";
import { ProgressWorkflowTemplate } from "../progress_workflow_templates/progress_workflow_template.entity";
import { ProgressWorkflowTemplateStep } from "../progress_workflow_templates/progress_workflow_template_step.entity";
import { ProgressTrackersService } from "./progress-trackers.service";
import {
  ProgressPublicController,
  ProgressTrackersController,
} from "./progress-trackers.controller";
import { Donation } from "src/donations/entities/donation.entity";
import { PermissionsModule } from "src/permissions/permissions.module";
import { JwtModule } from "@nestjs/jwt";
import { ProgressNotificationsModule } from "../progress_notifications/progress-notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProgressTracker,
      ProgressTrackerStep,
      ProgressStepEvidence,
      ProgressWorkflowTemplate,
      ProgressWorkflowTemplateStep,
      Donation,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    ProgressNotificationsModule,
  ],
  controllers: [ProgressTrackersController, ProgressPublicController],
  providers: [ProgressTrackersService],
  exports: [ProgressTrackersService],
})
export class ProgressTrackersModule {}
