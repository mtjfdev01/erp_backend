export const CSR_DONOR_AUDIT_PATCH_FIELDS = [
  "name",
  "registration_number",
  "email",
  "phone",
  "address",
  "city",
  "country",
  "notes",
  "is_active",
  "parent_organization_id",
  "pipeline_stage",
  "pipeline_ask_amount",
  "pipeline_pledge_amount",
  "pipeline_amount_currency",
] as const;

export const CSR_DONOR_AUDIT_SKIP_KEYS = new Set([
  "updated_by",
  "created_by",
  "branches",
  "parent_organization",
  "pipeline_stage_changed_by",
]);
