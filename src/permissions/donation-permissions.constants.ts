/**
 * OR-guard permission lists for donations split by online (website) vs offline vs in-kind.
 * Use with @RequiredPermissions([...DONATION_VIEW_GUARD]) — any listed path passes.
 */

const ONLINE = "fund_raising.online_donations";
const OFFLINE = "fund_raising.offline_donations";
const IN_KIND = "fund_raising.in_kind_donations";

export const DONATION_VIEW_PERMISSIONS = [
  `${ONLINE}.view`,
  `${OFFLINE}.view`,
  `${IN_KIND}.view`,
] as const;

export const DONATION_LIST_VIEW_PERMISSIONS = [
  `${ONLINE}.list_view`,
  `${OFFLINE}.list_view`,
  `${IN_KIND}.list_view`,
] as const;

export const DONATION_CREATE_PERMISSIONS = [
  `${ONLINE}.create`,
  `${OFFLINE}.create`,
  `${IN_KIND}.create`,
] as const;

export const DONATION_UPDATE_PERMISSIONS = [
  `${ONLINE}.update`,
  `${OFFLINE}.update`,
  `${IN_KIND}.update`,
] as const;

export const DONATION_DELETE_PERMISSIONS = [
  `${ONLINE}.delete`,
  `${OFFLINE}.delete`,
  `${IN_KIND}.delete`,
] as const;

export const DONATION_VIEW_GUARD = [
  ...DONATION_VIEW_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;

export const DONATION_VIEW_STAFF_GUARD = [
  ...DONATION_VIEW_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
] as const;

export const DONATION_CREATE_GUARD = [
  ...DONATION_CREATE_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
] as const;

export const DONATION_UPDATE_GUARD = [
  ...DONATION_UPDATE_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
] as const;

export const DONATION_DELETE_GUARD = [
  ...DONATION_DELETE_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
] as const;

/** Filter dropdowns on donation lists — list_view or view on online/offline/in-kind donations. */
export const DONATION_FILTER_OPTIONS_GUARD = [
  ...DONATION_LIST_VIEW_PERMISSIONS,
  ...DONATION_VIEW_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;
