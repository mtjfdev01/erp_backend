import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ReportsDashboardController } from "./reports-dashboard.controller";
import { ReportsDashboardService } from "./reports-dashboard.service";
import { FundraisingSummaryController } from "./fundraising-summary.controller";
import { FundraisingSummaryService } from "./fundraising-summary.service";
import { PermissionsModule } from "../../permissions/permissions.module";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [ReportsDashboardController, FundraisingSummaryController],
  providers: [ReportsDashboardService, FundraisingSummaryService],
  exports: [ReportsDashboardService, FundraisingSummaryService],
})
export class ReportsDashboardModule {}
