import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DashboardRebuildService } from "./dashboard-rebuild.service";

/**
 * **Currently not registered** in `dashboard.module.ts` (startup rebuild disabled).
 * Re-add `DashboardBootstrapService` to `providers` to enable.
 *
 * Runs once when the Nest application has finished bootstrapping.
 * Syncs dashboard aggregate tables from donations / donation-box data (does not touch donations or donors).
 *
 * Env:
 * - DASHBOARD_SKIP_BOOTSTRAP=true — skip entirely (e.g. tests, CI)
 * - DASHBOARD_BOOTSTRAP_FULL_REBUILD=true — run fullRebuild() instead of rebuild() (heavier; wipes aggregate tables only)
 */
@Injectable()
export class DashboardBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DashboardBootstrapService.name);

  constructor(private readonly rebuildService: DashboardRebuildService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.DASHBOARD_SKIP_BOOTSTRAP === "true") {
      this.logger.log(
        "Dashboard bootstrap skipped (DASHBOARD_SKIP_BOOTSTRAP=true)",
      );
      return;
    }

    try {
      const full = process.env.DASHBOARD_BOOTSTRAP_FULL_REBUILD === "true";
      this.logger.log(
        full
          ? "Dashboard bootstrap: running fullRebuild()…"
          : "Dashboard bootstrap: running rebuild() (last N months)…",
      );
      if (full) {
        await this.rebuildService.fullRebuild();
      } else {
        await this.rebuildService.rebuild();
      }
      this.logger.log("Dashboard bootstrap finished successfully");
    } catch (error: any) {
      this.logger.error(
        `Dashboard bootstrap failed: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }
}
