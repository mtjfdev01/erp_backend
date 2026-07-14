/** Task.project_id prefix — one follow-up task per donation. */
export const DONATION_PENDING_TASK_PROJECT_PREFIX = "donation-pending:";

/** Set to true when call-center follow-up task generation should run (cron + manual). */
export const DONATION_PENDING_TASK_GENERATION_ENABLED = true;

/** Minutes after creation before a pending donation triggers a call-center task. */
export const PENDING_DONATION_FOLLOW_UP_MINUTES = 3;

export const DONATION_PENDING_MOV_ITEMS = [
  "Contacted Donor"
] as const;

/** Website donations in these statuses may trigger a call-center follow-up task. */
export const WEBSITE_DONATION_FOLLOW_UP_STATUSES = [
  "pending",
  "failed",
] as const;

export function isWebsiteDonationFollowUpStatus(
  status: string | null | undefined,
): boolean {
  const normalized = String(status || "").toLowerCase();
  return (WEBSITE_DONATION_FOLLOW_UP_STATUSES as readonly string[]).includes(
    normalized,
  );
}

export function donationPendingTaskProjectId(donationId: number): string {
  return `${DONATION_PENDING_TASK_PROJECT_PREFIX}${donationId}`;
}

export function isDonationPendingFollowUpProjectId(
  projectId: string | null | undefined,
): boolean {
  return (
    typeof projectId === "string" &&
    projectId.startsWith(DONATION_PENDING_TASK_PROJECT_PREFIX)
  );
}

const PKT_TIMEZONE = "Asia/Karachi";

/** Today as YYYY-MM-DD in Pakistan time. */
export function getPktDateString(reference = new Date()): string {
  return reference.toLocaleDateString("en-CA", { timeZone: PKT_TIMEZONE });
}

/** Parse optional YYYY-MM-DD; defaults to today (PKT). */
export function resolveDonationFollowUpDate(input?: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return getPktDateString();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  return trimmed;
}

export function isPktToday(dateStr: string): boolean {
  return dateStr === getPktDateString();
}
