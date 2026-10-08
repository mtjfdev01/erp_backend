/** Permission paths for recurring reminder send logs. */

const MODULE = "fund_raising.recurring_reminder_logs";

export const RECURRING_REMINDER_LOG_LIST_VIEW_PERMISSIONS = [
  `${MODULE}.list_view`,
] as const;

export const RECURRING_REMINDER_LOG_VIEW_PERMISSIONS = [
  `${MODULE}.view`,
] as const;

export const RECURRING_REMINDER_LOG_LIST_VIEW_GUARD = [
  ...RECURRING_REMINDER_LOG_LIST_VIEW_PERMISSIONS,
  "fund_raising.recurring_donations.list_view",
  "fund_raising.recurring_donations.view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;

export const RECURRING_REMINDER_LOG_VIEW_GUARD = [
  ...RECURRING_REMINDER_LOG_VIEW_PERMISSIONS,
  ...RECURRING_REMINDER_LOG_LIST_VIEW_PERMISSIONS,
  "fund_raising.recurring_donations.view",
  "fund_raising.recurring_donations.list_view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;
