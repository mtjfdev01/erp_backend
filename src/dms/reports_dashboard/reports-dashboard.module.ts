import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ReportsDashboardController } from "./reports-dashboard.controller";
import { ReportsDashboardService } from "./reports-dashboard.service";
import { FundraisingSummaryController } from "./fundraising-summary.controller";
import { FundraisingSummaryService } from "./fundraising-summary.service";
import { ManagementOverviewController } from "./management-overview.controller";
import { ManagementOverviewService } from "./management-overview.service";
import { ReconciliationDeskController } from "./reconciliation-desk.controller";
import { ReconciliationDeskService } from "./reconciliation-desk.service";
import { FieldTeamDonationBoxesController } from "./field-team-donation-boxes.controller";
import { FieldTeamDonationBoxesService } from "./field-team-donation-boxes.service";
import { DonorRetentionRecurringController } from "./donor-retention-recurring.controller";
import { DonorRetentionRecurringService } from "./donor-retention-recurring.service";
import { DonorProfilesDemographicsController } from "./donor-profiles-demographics.controller";
import { DonorProfilesDemographicsService } from "./donor-profiles-demographics.service";
import { CampaignRoiController } from "./campaign-roi.controller";
import { CampaignRoiService } from "./campaign-roi.service";
import { PermissionsModule } from "../../permissions/permissions.module";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [
    ReportsDashboardController,
    FundraisingSummaryController,
    ManagementOverviewController,
    ReconciliationDeskController,
    FieldTeamDonationBoxesController,
    DonorRetentionRecurringController,
    DonorProfilesDemographicsController,
    CampaignRoiController,
  ],
  providers: [
    ReportsDashboardService,
    FundraisingSummaryService,
    ManagementOverviewService,
    ReconciliationDeskService,
    FieldTeamDonationBoxesService,
    DonorRetentionRecurringService,
    DonorProfilesDemographicsService,
    CampaignRoiService,
  ],
  exports: [
    ReportsDashboardService,
    FundraisingSummaryService,
    ManagementOverviewService,
    ReconciliationDeskService,
    FieldTeamDonationBoxesService,
    DonorRetentionRecurringService,
    DonorProfilesDemographicsService,
    CampaignRoiService,
  ],
})
export class ReportsDashboardModule {}
