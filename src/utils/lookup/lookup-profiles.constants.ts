/**
 * Whitelisted fields and label mapping per entity for GET /{resource}/lookup
 * (and legacy GET /{resource}/options where present).
 * Each module imports its profile slice in listForLookup / listForOptions.
 */

export type LookupProfile = {
  valueField: string;
  labelField: string;
  fields: readonly string[];
  defaultLimit: number;
  maxLimit: number;
};

const slim = (
  labelField: string,
  extraFields: string[] = [],
  limits?: { defaultLimit?: number; maxLimit?: number },
): LookupProfile => ({
  valueField: "id",
  labelField,
  fields: ["id", labelField, ...extraFields.filter((f) => f !== labelField)],
  defaultLimit: limits?.defaultLimit ?? 200,
  maxLimit: limits?.maxLimit ?? 500,
});

export const LOOKUP_PROFILES = {
  appeals: slim("title", [], { defaultLimit: 500, maxLimit: 500 }),
  workflow_templates: slim("name", ["code"]),
  donors: slim("name", ["email", "phone"]),
  users: {
    valueField: "id",
    labelField: "full_name",
    fields: ["id", "email", "first_name", "last_name"],
    defaultLimit: 200,
    maxLimit: 500,
  },
  donations: {
    valueField: "id",
    labelField: "id",
    fields: ["id", "amount", "status", "created_at"],
    defaultLimit: 200,
    maxLimit: 500,
  },
  donation_box: slim("shop_name", ["box_id_no", "key_no"]),
  donation_box_donations: {
    valueField: "id",
    labelField: "id",
    fields: ["id", "amount", "collection_date"],
    defaultLimit: 200,
    maxLimit: 500,
  },
  organizations: slim("name", ["email", "phone"]),
  csr_pocs: slim("name", ["email", "phone", "csr_donor_id"]),
  campaigns: slim("title", ["slug", "status"]),
  events: slim("title", ["slug", "status"]),
  event_pledges: slim("donor_name", ["donation_amount", "contact_number"]),
  volunteers: slim("name", ["email", "phone"]),
  email_templates: slim("name", ["subject", "category"]),
  receipt_templates: slim("name"),
  website_donation_projects: slim("title", ["slug"]),
  in_kind_items: slim("name", ["category"]),
  in_kind_donations: slim("item_name", ["quantity", "category"]),
  programs: slim("label", ["key", "status"]),
  subprograms: slim("label", ["key", "program_id", "status"]),
  tasks: slim("title", ["status", "priority"]),
  tickets: slim("title", ["status"]),
  complaint_cases: slim("title", ["complaint_workflow_status"]),
  permission_roles: slim("name", ["is_active"]),
  countries: slim("name", ["code"]),
  regions: slim("name", ["code", "country_id"]),
  sub_regions: slim("name", ["code", "region_id"]),
  districts: slim("name", ["code", "region_id"]),
  tehsils: slim("name", ["code", "district_id"]),
  cities: slim("name", ["code", "tehsil_id"]),
  routes: slim("name", ["code", "region_id"]),
  aid_people: slim("full_name", ["cnic", "phone"]),
  aid_households: slim("label", ["code"]),
  aid_applications: slim("application_no", ["status"]),
  social_posts: {
    valueField: "id",
    labelField: "post_text",
    fields: ["id", "post_text", "buffer_channel_name", "status"],
    defaultLimit: 100,
    maxLimit: 200,
  },
  progress_trackers: {
    valueField: "id",
    labelField: "id",
    fields: ["id", "overall_status", "template_id"],
    defaultLimit: 200,
    maxLimit: 500,
  },
  progress_batches: slim("tag_name", ["batch_number"]),
  ceo_notes: slim("title", ["status"]),
  project_command_sheets: slim("project_name", ["status"]),
  visitors: slim("visitor_name", ["organization", "visit_datetime"]),
  manual_recurring: {
    valueField: "id",
    labelField: "id",
    fields: ["id", "status", "donor_id"],
    defaultLimit: 200,
    maxLimit: 500,
  },
  recurring_donations: {
    valueField: "id",
    labelField: "id",
    fields: ["id", "status", "stripe_subscription_id"],
    defaultLimit: 200,
    maxLimit: 500,
  },
  dms_todos: slim("title", ["status"]),
  appeals_beneficiaries: slim("name", ["phone"]),
} as const satisfies Record<string, LookupProfile>;

export type LookupEntityKey = keyof typeof LOOKUP_PROFILES;
