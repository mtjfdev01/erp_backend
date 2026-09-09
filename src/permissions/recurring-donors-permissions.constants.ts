/** Permission paths and OR-guards for Recurring Donors list. */

const RECURRING_DONORS = "fund_raising.recurring_donors";

export const RECURRING_DONORS_LIST_VIEW_PERMISSIONS = [
  `${RECURRING_DONORS}.list_view`,
] as const;

export const RECURRING_DONORS_VIEW_PERMISSIONS = [
  `${RECURRING_DONORS}.view`,
] as const;

/** Shared ledger search/view: allow Recurring Donations OR Recurring Donors perms. */
export const RECURRING_DONORS_LIST_VIEW_GUARD = [
  ...RECURRING_DONORS_LIST_VIEW_PERMISSIONS,
  ...RECURRING_DONORS_VIEW_PERMISSIONS,
  "fund_raising.recurring_donations.list_view",
  "fund_raising.recurring_donations.view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;

export const RECURRING_DONORS_VIEW_GUARD = [
  ...RECURRING_DONORS_VIEW_PERMISSIONS,
  ...RECURRING_DONORS_LIST_VIEW_PERMISSIONS,
  "fund_raising.recurring_donations.view",
  "fund_raising.recurring_donations.list_view",
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;
