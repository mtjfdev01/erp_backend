/**
 * My To-Dos permissions.
 * New dept: todos.dms_todos.* — legacy: fund_raising.dms_todos.* (both accepted).
 */
const NEXT = "todos.dms_todos";
const LEGACY = "fund_raising.dms_todos";

const STAFF = [
  "fund_raising_manager",
  "fund_raising_user",
  "super_admin",
] as const;

const STAFF_DELETE = ["fund_raising_manager", "super_admin"] as const;

export const DMS_TODOS_CREATE_GUARD = [
  `${NEXT}.create`,
  `${LEGACY}.create`,
  ...STAFF,
] as const;

export const DMS_TODOS_LIST_GUARD = [
  `${NEXT}.list_view`,
  `${NEXT}.view`,
  `${NEXT}.create`,
  `${LEGACY}.list_view`,
  `${LEGACY}.view`,
  `${LEGACY}.create`,
  ...STAFF,
] as const;

export const DMS_TODOS_VIEW_GUARD = [
  `${NEXT}.view`,
  `${NEXT}.list_view`,
  `${LEGACY}.view`,
  `${LEGACY}.list_view`,
  ...STAFF,
] as const;

export const DMS_TODOS_UPDATE_GUARD = [
  `${NEXT}.update`,
  `${LEGACY}.update`,
  ...STAFF,
] as const;

export const DMS_TODOS_DELETE_GUARD = [
  `${NEXT}.delete`,
  `${LEGACY}.delete`,
  ...STAFF_DELETE,
] as const;
