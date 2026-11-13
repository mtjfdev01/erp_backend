/** Lifecycle / mutation actions written to aid_application_audit_logs. */
export const AID_AUDIT_ACTIONS = {
  CREATED: "created",
  UPDATED: "updated",
  STATUS_CHANGED: "status_changed",
  DRAFT_APPROVED: "draft_approved",
  ASSIGNEE_CHANGED: "assignee_changed",
  MARKED_INCOMPLETE: "marked_incomplete",
  RESUMED: "resumed",
  REJECTED: "rejected",
  VERIFIED: "verified",
  VERIFICATION_COMPLETED: "verification_completed",
  MANAGER_FORWARDED: "manager_forwarded",
  MEAL_FORWARDED: "meal_forwarded",
  CEO_DECIDED: "ceo_decided",
  DELIVERY_UPDATED: "delivery_updated",
  MEAL_UPDATED: "meal_updated",
  PREVIEW_APPROVAL_UPDATED: "preview_approval_updated",
  ATTACHMENT_UPLOADED: "attachment_uploaded",
  ATTACHMENT_DELETED: "attachment_deleted",
  ATTACHMENT_MISSING_SET: "attachment_missing_set",
  MISSING_DOCS_SET: "missing_docs_set",
  ARCHIVED: "archived",
  LEAKAGE_OVERRIDE: "leakage_override",
} as const;

export type AidAuditAction =
  (typeof AID_AUDIT_ACTIONS)[keyof typeof AID_AUDIT_ACTIONS];

export const AID_AUDIT_SOURCE = {
  STAFF_UI: "staff_ui",
  OFFLINE_SYNC: "offline_sync",
  SYSTEM: "system",
} as const;

/** Scalar / status columns compared on PATCH update. */
export const AID_AUDIT_PATCH_FIELDS = [
  "status",
  "title",
  "request_summary",
  "case_source",
  "requested_aid_type",
  "aid_program",
  "expected_amount",
  "expected_amount_max",
  "assigned_to_user_id",
  "writer_person_id",
  "writer_relation",
  "verification_notes",
  "rejection_reason",
  "leakage_override_reason",
  "household_id",
] as const;

export const AID_AUDIT_SKIP_KEYS = new Set([
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "beneficiary",
  "writer",
  "family_members",
]);
