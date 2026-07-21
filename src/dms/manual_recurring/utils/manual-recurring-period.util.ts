import { getPeriodBounds } from "../../campaigns/utils/campaign-recurring.util";
import { CampaignTargetFrequency } from "../../campaigns/utils/campaign-recurring.constants";

const PKT_TIMEZONE = "Asia/Karachi";

/** Current instant interpreted in PKT (for month boundaries). */
export function getPktNow(reference = new Date()): Date {
  return new Date(reference.toLocaleString("en-US", { timeZone: PKT_TIMEZONE }));
}

export function getMonthlyPeriodKey(reference = new Date()): string {
  const pkt = getPktNow(reference);
  return getPeriodBounds(pkt, CampaignTargetFrequency.MONTHLY).key;
}

export function getMonthlyPeriodBounds(reference = new Date()) {
  const pkt = getPktNow(reference);
  return getPeriodBounds(pkt, CampaignTargetFrequency.MONTHLY);
}

export function formatPeriodKeyLabel(periodKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return new Date(year, month, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Add months to YYYY-MM period key (month-safe). */
export function addMonthsToPeriodKey(periodKey: string, months: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;
  let year = Number(match[1]);
  let month = Number(match[2]) - 1 + months;
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  while (month > 11) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function computePrepaidEndPeriodKey(
  startPeriodKey: string,
  months: number,
): string {
  if (months < 1) return startPeriodKey;
  return addMonthsToPeriodKey(startPeriodKey, months - 1);
}

export function isPeriodKeyInRange(
  periodKey: string,
  startKey: string | null | undefined,
  endKey: string | null | undefined,
): boolean {
  if (!startKey || !endKey) return false;
  return periodKey >= startKey && periodKey <= endKey;
}
