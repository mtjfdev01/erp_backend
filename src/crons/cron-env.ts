/**
 * Cron jobs are off in non-production unless ENABLE_CRONS=true.
 * Production runs crons unless ENABLE_CRONS=false.
 */
export function areCronJobsEnabled(): boolean {
  const flag = String(process.env.ENABLE_CRONS || "")
    .trim()
    .toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return process.env.NODE_ENV === "production";
}
