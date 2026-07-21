import { Controller, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { DmsCronsService } from "./dms-crons.service";
import { JwtGuard } from "../../auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions";

@Controller("dms-crons")
// @UseGuards(JwtGuard, PermissionsGuard)
export class DmsCronsController {
  constructor(private readonly dmsCronsService: DmsCronsService) {}

  /**
   * One-time manual trigger to sync ALL non-completed Meezan donations
   * POST /dms-crons/sync-meezan
   */
  @Post("sync-meezan")
  // @RequiredPermissions(['fund_raising.donations.view', 'super_admin', 'fund_raising_manager'])
  async syncMeezanDonations(@Res() res: Response) {
    try {
      const result = await this.dmsCronsService.syncMeezanDonations(true);
      return res.status(200).json({
        success: true,
        message: `Meezan sync complete — Total: ${result.total}, Synced: ${result.synced}, Updated: ${result.updated}, Failed: ${result.failed}`,
        data: result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Meezan sync failed: ${error.message}`,
      });
    }
  }

  /**
   * One-time manual trigger to clean up pending donations
   * POST /dms-crons/cleanup-pending-donations
   */
  @Post("cleanup-pending-donations")
  // @RequiredPermissions(['fund_raising.donations.view', 'super_admin', 'fund_raising_manager'])
  async cleanupPendingDonations(@Res() res: Response) {
    try {
      const result = await this.dmsCronsService.cleanupPendingDonations();
      return res.status(200).json({
        success: true,
        message: `Pending donations cleanup complete — Processed Donors: ${result.processedDonors}, Deleted Donations: ${result.deletedDonations}`,
        data: result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Pending donations cleanup failed: ${error.message}`,
      });
    }
  }

  /**
   * Manual trigger: create call-center tasks for pending donations on a given day.
   * POST /dms-crons/pending-donation-follow-up
   * POST /dms-crons/pending-donation-follow-up?date=2026-06-02
   *
   * Defaults to today (PKT). Only **website** donations with status pending or failed,
   * and donation.date matching that day, are considered.
   */
  @Post("pending-donation-follow-up")
  async pendingDonationFollowUp(
    @Query("date") date: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const result =
        await this.dmsCronsService.runPendingDonationCallCenterFollowUp(date);
      return res.status(200).json({
        success: true,
        message: `Pending donation follow-up (${result.donationDate}) — scanned: ${result.scanned}, created: ${result.created}`,
        data: result,
      });
    } catch (error) {
      const status = error?.status === 400 ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: `Pending donation follow-up failed: ${error.message}`,
      });
    }
  }

  /**
   * Manual trigger: send reminders to manual recurring donors who have not donated this month.
   * POST /dms-crons/manual-recurring-reminders
   * POST /dms-crons/manual-recurring-reminders?period_key=2026-07&dry_run=true
   */
  @Post("manual-recurring-reminders")
  async manualRecurringReminders(
    @Query("period_key") periodKey: string | undefined,
    @Query("dry_run") dryRun: string | undefined,
    @Query("force") force: string | undefined,
    @Query("chunk_size") chunkSize: string | undefined,
    @Query("include_details") includeDetails: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const result = await this.dmsCronsService.runManualRecurringDonationReminders({
        period_key: periodKey,
        dry_run: dryRun === "true",
        force: force === "true",
        chunk_size: chunkSize ? Number(chunkSize) : undefined,
        include_details: includeDetails === "true",
      });
      return res.status(200).json({
        success: true,
        message: `Recurring campaign job (${result.period_key}) — scanned: ${result.scanned}, reminders: ${result.reminders_sent}, thanks: ${result.thanks_sent}, dry_run: ${result.dry_run}`,
        data: result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Manual recurring reminders failed: ${error.message}`,
      });
    }
  }
}
