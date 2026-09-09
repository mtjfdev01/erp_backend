/**
 * OR-guard permission lists for Tickets module (formerly Complaints).
 * Use with @RequiredPermissions([...TICKET_VIEW_GUARD]) — any listed path passes.
 *
 * Permission tree (UserPermissions UI):
 *   tickets.tickets.{create,list_view,view,update,delete,assign,approve,complete}
 *   tickets.dashboard.{view}
 *
 * Legacy complaints.* paths are kept for users already granted access.
 */

const MODULE = "tickets.tickets";
const DASHBOARD = "tickets.dashboard";
const FLAT = "tickets";
const LEGACY_MODULE = "complaints.complaints";
const LEGACY_DASHBOARD = "complaints.dashboard";
const LEGACY_FLAT = "complaints";

export const COMPLAINT_CREATE_GUARD = [
  `${MODULE}.create`,
  `${FLAT}.create`,
  `${LEGACY_MODULE}.create`,
  `${LEGACY_FLAT}.create`,
  "super_admin",
] as const;

export const COMPLAINT_LIST_VIEW_GUARD = [
  `${MODULE}.list_view`,
  `${FLAT}.list_view`,
  `${MODULE}.view`,
  `${FLAT}.view`,
  `${DASHBOARD}.view`,
  `${LEGACY_MODULE}.list_view`,
  `${LEGACY_FLAT}.list_view`,
  `${LEGACY_MODULE}.view`,
  `${LEGACY_FLAT}.view`,
  `${LEGACY_DASHBOARD}.view`,
  "super_admin",
] as const;

export const COMPLAINT_VIEW_GUARD = [
  `${MODULE}.view`,
  `${FLAT}.view`,
  `${MODULE}.list_view`,
  `${FLAT}.list_view`,
  `${LEGACY_MODULE}.view`,
  `${LEGACY_FLAT}.view`,
  `${LEGACY_MODULE}.list_view`,
  `${LEGACY_FLAT}.list_view`,
  "super_admin",
] as const;

export const COMPLAINT_UPDATE_GUARD = [
  `${MODULE}.update`,
  `${FLAT}.update`,
  `${LEGACY_MODULE}.update`,
  `${LEGACY_FLAT}.update`,
  "super_admin",
] as const;

export const COMPLAINT_DELETE_GUARD = [
  `${MODULE}.delete`,
  `${FLAT}.delete`,
  `${LEGACY_MODULE}.delete`,
  `${LEGACY_FLAT}.delete`,
  "super_admin",
] as const;

export const COMPLAINT_ASSIGN_GUARD = [
  `${MODULE}.assign`,
  `${FLAT}.assign`,
  `${MODULE}.update`,
  `${FLAT}.update`,
  `${LEGACY_MODULE}.assign`,
  `${LEGACY_FLAT}.assign`,
  `${LEGACY_MODULE}.update`,
  `${LEGACY_FLAT}.update`,
  "super_admin",
] as const;

export const COMPLAINT_APPROVE_GUARD = [
  `${MODULE}.approve`,
  `${FLAT}.approve`,
  `${MODULE}.update`,
  `${FLAT}.update`,
  `${LEGACY_MODULE}.approve`,
  `${LEGACY_FLAT}.approve`,
  `${LEGACY_MODULE}.update`,
  `${LEGACY_FLAT}.update`,
  "super_admin",
] as const;

export const COMPLAINT_COMPLETE_GUARD = [
  `${MODULE}.complete`,
  `${FLAT}.complete`,
  `${MODULE}.update`,
  `${FLAT}.update`,
  `${LEGACY_MODULE}.complete`,
  `${LEGACY_FLAT}.complete`,
  `${LEGACY_MODULE}.update`,
  `${LEGACY_FLAT}.update`,
  "super_admin",
] as const;

export const COMPLAINT_DASHBOARD_GUARD = [
  `${DASHBOARD}.view`,
  `${DASHBOARD}.list_view`,
  `${MODULE}.list_view`,
  `${MODULE}.view`,
  `${FLAT}.list_view`,
  `${FLAT}.view`,
  `${LEGACY_DASHBOARD}.view`,
  `${LEGACY_DASHBOARD}.list_view`,
  `${LEGACY_MODULE}.list_view`,
  `${LEGACY_MODULE}.view`,
  `${LEGACY_FLAT}.list_view`,
  `${LEGACY_FLAT}.view`,
  "super_admin",
] as const;

/** Aliases preferred for new code */
export const TICKET_CREATE_GUARD = COMPLAINT_CREATE_GUARD;
export const TICKET_LIST_VIEW_GUARD = COMPLAINT_LIST_VIEW_GUARD;
export const TICKET_VIEW_GUARD = COMPLAINT_VIEW_GUARD;
export const TICKET_UPDATE_GUARD = COMPLAINT_UPDATE_GUARD;
export const TICKET_DELETE_GUARD = COMPLAINT_DELETE_GUARD;
export const TICKET_ASSIGN_GUARD = COMPLAINT_ASSIGN_GUARD;
export const TICKET_APPROVE_GUARD = COMPLAINT_APPROVE_GUARD;
export const TICKET_COMPLETE_GUARD = COMPLAINT_COMPLETE_GUARD;
export const TICKET_DASHBOARD_GUARD = COMPLAINT_DASHBOARD_GUARD;
