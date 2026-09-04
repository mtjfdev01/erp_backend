/** Permissions for CSR POC contacts (fund_raising.csr_pocs). */

const POC = "fund_raising.csr_pocs";
const ORG = "fund_raising.organizations";

/** Existing CSR Donor (organizations) permissions still grant POC access. */
export const CSR_POC_LIST_GUARD = [
  `${POC}.list_view`,
  `${POC}.view`,
  `${ORG}.list_view`,
  `${ORG}.view`,
  "fund_raising.donors.list_view",
  "fund_raising.donors.view",
  "fund_raising.offline_donors.list_view",
  "fund_raising.online_donors.list_view",
  "fund_raising_manager",
  "super_admin",
] as const;

export const CSR_POC_VIEW_GUARD = [
  `${POC}.view`,
  `${POC}.list_view`,
  `${ORG}.view`,
  `${ORG}.list_view`,
  "fund_raising.donors.view",
  "fund_raising.offline_donors.view",
  "fund_raising.online_donors.view",
  "fund_raising_manager",
  "super_admin",
] as const;

export const CSR_POC_CREATE_GUARD = [
  `${POC}.create`,
  `${POC}.update`,
  `${ORG}.create`,
  `${ORG}.update`,
  "fund_raising.donors.create",
  "fund_raising.offline_donors.create",
  "fund_raising.online_donors.create",
  "fund_raising_manager",
  "super_admin",
] as const;

export const CSR_POC_UPDATE_GUARD = [
  `${POC}.update`,
  `${ORG}.update`,
  "fund_raising.donors.update",
  "fund_raising.offline_donors.update",
  "fund_raising.online_donors.update",
  "fund_raising_manager",
  "super_admin",
] as const;

export const CSR_POC_DELETE_GUARD = [
  `${POC}.delete`,
  `${POC}.update`,
  `${ORG}.delete`,
  `${ORG}.update`,
  "fund_raising.donors.delete",
  "fund_raising_manager",
  "super_admin",
] as const;
