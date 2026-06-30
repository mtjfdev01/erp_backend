export const TASK_REMINDER_TIMEZONE = "Asia/Karachi";

export function formatDateOnlyPkt(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TASK_REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function getPktHour(d: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASK_REMINDER_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  return parseInt(hour, 10);
}

export function dueDateToPktDateString(dueDate: Date | string): string {
  if (typeof dueDate === "string") {
    return dueDate.slice(0, 10);
  }
  return formatDateOnlyPkt(dueDate);
}

export function normalizeRemindDateString(value: string): string {
  return String(value || "").slice(0, 10);
}

/** Signed calendar-day difference: toDate minus fromDate (PKT date strings). */
export function calendarDaysBetweenPkt(
  fromDate: string,
  toDate: string,
): number {
  const from = normalizeRemindDateString(fromDate);
  const to = normalizeRemindDateString(toDate);
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

export function daysUntilDueFromTodayPkt(dueDate: Date | string): number {
  const today = formatDateOnlyPkt(new Date());
  const dueStr = dueDateToPktDateString(dueDate);
  return calendarDaysBetweenPkt(today, dueStr);
}

export function isReminderSlotInPast(
  remindOnDate: string,
  remindAtHour: number,
): boolean {
  const now = new Date();
  const today = formatDateOnlyPkt(now);
  const hour = getPktHour(now);
  if (remindOnDate < today) return true;
  if (remindOnDate === today && remindAtHour < hour) return true;
  return false;
}

export function dueReminderLabel(offsetDays: number): string {
  if (offsetDays < 0) return "overdue";
  if (offsetDays === 0) return "due today";
  if (offsetDays === 1) return "due tomorrow";
  return `due in ${offsetDays} days`;
}

export function formatPktHourLabel(hour: number): string {
  const h = Math.max(0, Math.min(23, hour));
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}
