/**
 * Grievance / general complaints workflow (type = complaint).
 * Separate from issue/ticket permissions — issues flow is unchanged.
 *
 * Permission tree (UserPermissions UI):
 *   tickets.complaints_case.{create,list_view,view,investigate,update_status,manage_nominees,view_nominees,schedule_meetings,add_narrative}
 */

const MODULE = "tickets.complaints_case";
const FLAT = "complaints_case";

export const COMPLAINT_CASE_CREATE_GUARD = [
  `${MODULE}.create`,
  `${FLAT}.create`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_LIST_VIEW_GUARD = [
  `${MODULE}.list_view`,
  `${FLAT}.list_view`,
  `${MODULE}.view`,
  `${FLAT}.view`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_VIEW_GUARD = [
  `${MODULE}.view`,
  `${FLAT}.view`,
  `${MODULE}.list_view`,
  `${FLAT}.list_view`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_INVESTIGATE_GUARD = [
  `${MODULE}.investigate`,
  `${FLAT}.investigate`,
  `${MODULE}.update_status`,
  `${FLAT}.update_status`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_UPDATE_STATUS_GUARD = [
  `${MODULE}.update_status`,
  `${FLAT}.update_status`,
  `${MODULE}.investigate`,
  `${FLAT}.investigate`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_MANAGE_NOMINEES_GUARD = [
  `${MODULE}.manage_nominees`,
  `${FLAT}.manage_nominees`,
  `${MODULE}.investigate`,
  `${FLAT}.investigate`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_VIEW_NOMINEES_GUARD = [
  `${MODULE}.view_nominees`,
  `${FLAT}.view_nominees`,
  `${MODULE}.view`,
  `${FLAT}.view`,
  `${MODULE}.list_view`,
  `${FLAT}.list_view`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_SCHEDULE_MEETINGS_GUARD = [
  `${MODULE}.schedule_meetings`,
  `${FLAT}.schedule_meetings`,
  `${MODULE}.investigate`,
  `${FLAT}.investigate`,
  "super_admin",
] as const;

export const COMPLAINT_CASE_ADD_NARRATIVE_GUARD = [
  `${MODULE}.add_narrative`,
  `${FLAT}.add_narrative`,
  `${MODULE}.investigate`,
  `${FLAT}.investigate`,
  `${MODULE}.update`,
  "super_admin",
] as const;
