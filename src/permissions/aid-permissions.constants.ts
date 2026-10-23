/**
 * Aid Beneficiaries / Applications / Drafts / Verification / Disbursements / Overview.
 * Primary: program.aid_* — legacy: fund_raising.aid_* (both accepted).
 */
const PEOPLE = "program.aid_people";
const PEOPLE_LEGACY = "fund_raising.aid_people";
const APPS = "program.aid_applications";
const APPS_LEGACY = "fund_raising.aid_applications";
const DRAFTS = "program.aid_drafts";
const DRAFTS_LEGACY = "fund_raising.aid_drafts";
const VERIFY = "program.aid_verification";
const VERIFY_LEGACY = "fund_raising.aid_verification";
const DISB = "program.aid_disbursements";
const DISB_LEGACY = "fund_raising.aid_disbursements";
const OVERVIEW = "program.aid_overview";
const OVERVIEW_LEGACY = "fund_raising.aid_overview";

const STAFF = ["program_manager", "fund_raising_manager", "super_admin"] as const;

const people = (action: string) =>
  [`${PEOPLE}.${action}`, `${PEOPLE_LEGACY}.${action}`] as const;

const apps = (action: string) =>
  [`${APPS}.${action}`, `${APPS_LEGACY}.${action}`] as const;

const drafts = (action: string) =>
  [`${DRAFTS}.${action}`, `${DRAFTS_LEGACY}.${action}`] as const;

const verify = (action: string) =>
  [`${VERIFY}.${action}`, `${VERIFY_LEGACY}.${action}`] as const;

const disb = (action: string) =>
  [`${DISB}.${action}`, `${DISB_LEGACY}.${action}`] as const;

const overview = (action: string) =>
  [`${OVERVIEW}.${action}`, `${OVERVIEW_LEGACY}.${action}`] as const;

/** Welfare Overview dashboard */
export const AID_OVERVIEW_VIEW_GUARD = [
  ...overview("view"),
  ...STAFF,
] as const;

export const AID_PEOPLE_LIST_GUARD = [
  ...people("list_view"),
  ...people("view"),
  ...apps("list_view"),
  ...apps("view"),
  ...drafts("list_view"),
  ...drafts("view"),
  ...verify("list_view"),
  ...verify("view"),
  ...STAFF,
] as const;

export const AID_PEOPLE_VIEW_GUARD = [
  ...people("view"),
  ...people("list_view"),
  ...apps("view"),
  ...drafts("view"),
  ...verify("view"),
  ...STAFF,
] as const;

export const AID_PEOPLE_CREATE_GUARD = [
  ...people("create"),
  ...apps("create"),
  ...drafts("create"),
  ...STAFF,
] as const;

export const AID_PEOPLE_UPDATE_GUARD = [
  ...people("update"),
  ...apps("update"),
  ...drafts("update"),
  ...STAFF,
] as const;

export const AID_PEOPLE_DELETE_GUARD = [
  ...people("delete"),
  ...STAFF,
] as const;

export const AID_APPLICATIONS_LIST_GUARD = [
  ...apps("list_view"),
  ...apps("view"),
  ...apps("create"),
  ...apps("approve_draft"),
  ...drafts("list_view"),
  ...drafts("view"),
  ...drafts("create"),
  ...drafts("approve_draft"),
  ...apps("ceo_approve"),
  ...apps("deliver"),
  ...apps("bulk_verify"),
  ...verify("list_view"),
  ...verify("view"),
  ...verify("bulk_verify"),
  ...STAFF,
] as const;

export const AID_APPLICATIONS_VIEW_GUARD = [
  ...apps("view"),
  ...apps("list_view"),
  ...apps("create"),
  ...apps("approve_draft"),
  ...drafts("view"),
  ...drafts("list_view"),
  ...drafts("create"),
  ...drafts("approve_draft"),
  ...apps("ceo_approve"),
  ...apps("deliver"),
  ...apps("bulk_verify"),
  ...verify("view"),
  ...verify("list_view"),
  ...verify("bulk_verify"),
  ...STAFF,
] as const;

export const AID_APPLICATIONS_CREATE_GUARD = [
  ...drafts("create"),
  ...apps("create"),
  ...STAFF,
] as const;

/** Registration / draft edits + verification progress / attachments / verify / reject. */
export const AID_APPLICATIONS_UPDATE_GUARD = [
  ...apps("update"),
  ...drafts("update"),
  ...verify("update"),
  ...STAFF,
] as const;

export const AID_APPLICATIONS_DELETE_GUARD = [
  ...apps("delete"),
  ...drafts("delete"),
  ...STAFF,
] as const;

/**
 * Approve a registration draft → submitted (enters verification pipeline).
 * Primary: aid_drafts.approve_draft — legacy: aid_applications.approve_draft.
 */
export const AID_APPLICATIONS_APPROVE_DRAFT_GUARD = [
  ...drafts("approve_draft"),
  ...apps("approve_draft"),
  ...STAFF,
] as const;

/** CEO approve / reject after verification (ceo_approve required; not generic update). */
export const AID_APPLICATIONS_CEO_GUARD = [
  ...apps("ceo_approve"),
  ...STAFF,
] as const;

/** Mark delivery after successful CEO approval */
export const AID_APPLICATIONS_DELIVER_GUARD = [
  ...apps("deliver"),
  ...disb("deliver"),
  ...STAFF,
] as const;

/** Bulk-mark investigation checklist (UI capability; verify still uses update). */
export const AID_APPLICATIONS_BULK_VERIFY_GUARD = [
  ...verify("bulk_verify"),
  ...apps("bulk_verify"),
  ...STAFF,
] as const;

/** Disbursements queue list */
export const AID_DISBURSEMENTS_LIST_GUARD = [
  ...disb("list_view"),
  ...disb("view"),
  ...disb("deliver"),
  ...apps("deliver"),
  ...apps("list_view"),
  ...STAFF,
] as const;

/** Disbursement installment detail / record form */
export const AID_DISBURSEMENTS_VIEW_GUARD = [
  ...disb("view"),
  ...disb("list_view"),
  ...disb("deliver"),
  ...apps("deliver"),
  ...apps("view"),
  ...STAFF,
] as const;

/** Create / ensure installment plan for an approved application */
export const AID_DISBURSEMENTS_CREATE_GUARD = [
  ...disb("create"),
  ...disb("deliver"),
  ...apps("deliver"),
  ...STAFF,
] as const;

/** Record delivery / update installment status */
export const AID_DISBURSEMENTS_DELIVER_GUARD = [
  ...disb("deliver"),
  ...disb("update"),
  ...apps("deliver"),
  ...STAFF,
] as const;
