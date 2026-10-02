import {
  DONATION_FILTER_OPTIONS_GUARD,
  DONATION_LIST_VIEW_PERMISSIONS,
  DONATION_VIEW_PERMISSIONS,
} from "../../permissions/donation-permissions.constants";

/**
 * Appeals dropdown: module list access OR donation filter context (no full appeal record).
 */
export const APPEALS_OPTIONS_GUARD = [
  "dms.appeals.list_view",
  "fund_raising.appeals.list_view",
  ...DONATION_LIST_VIEW_PERMISSIONS,
  ...DONATION_VIEW_PERMISSIONS,
  "super_admin",
  "fund_raising_manager",
  "fund_raising_user",
] as const;

/**
 * Soft lookup guard: any authenticated staff with module list_view (or super_admin).
 * Controllers may widen/narrow; prefer module list_view + super_admin at minimum.
 */
export const LOOKUP_SUPER_ADMIN = ["super_admin"] as const;

export { DONATION_FILTER_OPTIONS_GUARD };
