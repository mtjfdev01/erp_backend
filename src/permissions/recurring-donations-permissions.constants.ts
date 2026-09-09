/** Permission paths and OR-guards for Stripe recurring donations ledger. */

const RECURRING = "fund_raising.recurring_donations";

export const RECURRING_DONATION_LIST_VIEW_PERMISSIONS = [
  `${RECURRING}.list_view`,
] as const;

export const RECURRING_DONATION_VIEW_PERMISSIONS = [
  `${RECURRING}.view`,
] as const;

export const RECURRING_DONATION_CREATE_PERMISSIONS = [
  `${RECURRING}.create`,
] as const;

export const RECURRING_DONATION_UPDATE_PERMISSIONS = [
  `${RECURRING}.update`,
] as const;

export const RECURRING_DONATION_LIST_VIEW_GUARD = [
  ...RECURRING_DONATION_LIST_VIEW_PERMISSIONS,
  // Recurring Donors module may also list via the same search endpoint
  "fund_raising.recurring_donors.list_view",
  "fund_raising.recurring_donors.view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;

export const RECURRING_DONATION_VIEW_GUARD = [
  ...RECURRING_DONATION_VIEW_PERMISSIONS,
  "fund_raising.recurring_donors.view",
  "fund_raising.recurring_donors.list_view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;

export const RECURRING_DONATION_CREATE_GUARD = [
  ...RECURRING_DONATION_CREATE_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
] as const;

export const RECURRING_DONATION_UPDATE_GUARD = [
  ...RECURRING_DONATION_UPDATE_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
] as const;
