/** Field investigation — verify declared intake claims on site. */

export const AID_INVESTIGATION_STATUSES = [
  "verified",
  "mismatch",
  "not_checked",
] as const;

export type AidInvestigationStatus =
  (typeof AID_INVESTIGATION_STATUSES)[number];

export type AidInvestigationItemResult = {
  status: AidInvestigationStatus;
  note?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_id?: number | null;
};

/** Which application view tab this claim belongs to (case = all / process). */
export type AidInvestigationSection =
  | "case"
  | "beneficiary"
  | "family"
  | "applicant";

export type AidInvestigationItem = {
  key: string;
  label: string;
  /** Declared value from intake (null for process rows). */
  declared: string | null;
  required: boolean;
  kind: "claim" | "process";
  /** Allow mismatch + found note (claims yes; process usually no). */
  allow_mismatch?: boolean;
  /** View-tab grouping for filtered investigation UI. */
  section?: AidInvestigationSection;
  /** Process/claim may require a supporting file (e.g. Site Visit). */
  accepts_file?: boolean;
};

type PersonLike = {
  id?: number;
  full_name?: string | null;
  cnic?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  monthly_income?: string | number | null;
  occupation?: string | null;
  marital_status?: string | null;
  has_disability?: boolean;
  disability_type?: string | null;
  has_land?: boolean;
  property_type?: string | null;
  property_details?: string | null;
  resident_type?: string | null;
  resident_ownership_status?: string | null;
  rented_amount?: string | number | null;
  house_area_marla?: string | number | null;
  house_details?: string | null;
  has_livestock?: boolean;
  livestock_entries?: Record<string, unknown>[] | null;
  has_vehicle?: boolean;
  vehicle_type?: string | null;
  necta_status?: string | null;
  bisp_status?: string | null;
  date_of_birth?: string | Date | null;
};

type TreePerson = {
  person?: PersonLike | null;
  relation_type?: string | null;
  notes?: string | null;
};

type FamilyTree = {
  parents?: TreePerson[];
  spouse?: TreePerson[];
  children?: TreePerson[];
  brothers?: TreePerson[];
  sisters?: TreePerson[];
  siblings?: TreePerson[];
  grandparents?: TreePerson[];
  grandchildren?: TreePerson[];
  extended?: TreePerson[];
};

type HouseholdMember = {
  role_in_household?: string | null;
  person?: PersonLike | null;
};

/** Fixed process rows — always required for verify. Site Visit is first. */
export const AID_INVESTIGATION_PROCESS_ITEMS: AidInvestigationItem[] = [
  {
    key: "site_visit",
    label: "Site Visit",
    declared: null,
    required: true,
    kind: "process",
    allow_mismatch: false,
    section: "case",
    accepts_file: true,
  },
  {
    key: "need_verified",
    label: "Aid need verified as genuine",
    declared: null,
    required: true,
    kind: "process",
    allow_mismatch: false,
    section: "case",
  },
  {
    key: "duplicates_reviewed",
    label: "Duplicate / prior-aid flags reviewed",
    declared: null,
    required: true,
    kind: "process",
    allow_mismatch: false,
    section: "case",
  },
  {
    key: "eligible_recommended",
    label: "Case recommended for CEO approval",
    declared: null,
    required: true,
    kind: "process",
    allow_mismatch: false,
    section: "case",
  },
];

/** @deprecated Use investigation items from buildInvestigationItems / findOne. */
export const AID_VERIFICATION_CHECKLIST_ITEMS = AID_INVESTIGATION_PROCESS_ITEMS.map(
  (i) => ({
    key: i.key,
    label: i.label,
    required: i.required,
    kind: i.kind,
  }),
);

function money(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `PKR ${n.toLocaleString("en-PK")}`;
}

function ageFromDob(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const age = Math.floor(
    (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
  return age >= 0 && age < 130 ? age : null;
}

function personLabel(p?: PersonLike | null): string {
  if (!p) return "—";
  const bits = [p.full_name || "—"];
  const age = ageFromDob(p.date_of_birth);
  if (age != null) bits.push(`(${age})`);
  if (p.cnic) bits.push(p.cnic);
  return bits.join(", ").replace(", (", " (");
}

function listPeople(rows?: TreePerson[]): string | null {
  if (!rows?.length) return null;
  const labels = rows
    .map((r) => personLabel(r.person))
    .filter((s) => s && s !== "—");
  return labels.length ? labels.join("; ") : null;
}

function livestockSummary(p?: PersonLike | null): string | null {
  if (!p?.has_livestock) return p?.has_livestock === false ? "No livestock" : null;
  const entries = Array.isArray(p.livestock_entries) ? p.livestock_entries : [];
  if (!entries.length) return "Yes (details not listed)";
  return entries
    .map((row) => {
      const t = String(row.animal_type || "animal");
      const q = row.quantity != null ? `× ${row.quantity}` : "";
      const own = row.ownership ? ` · ${row.ownership}` : "";
      return `${t} ${q}${own}`.trim();
    })
    .join("; ");
}

function vehicleSummary(p?: PersonLike | null): string | null {
  if (!p?.has_vehicle) return p?.has_vehicle === false ? "No vehicle" : null;
  return p.vehicle_type
    ? `Yes · ${String(p.vehicle_type).replace(/_/g, " ")}`
    : "Yes";
}

function residentSummary(p?: PersonLike | null): string | null {
  if (!p?.resident_type) return null;
  const parts = [String(p.resident_type).replace(/_/g, " ")];
  if (p.resident_ownership_status) parts.push(String(p.resident_ownership_status));
  if (p.rented_amount != null && p.rented_amount !== "") {
    parts.push(`Rent ${money(p.rented_amount)}`);
  }
  if (p.house_area_marla != null && p.house_area_marla !== "") {
    parts.push(`${p.house_area_marla} Marla`);
  }
  if (p.house_details) parts.push(String(p.house_details));
  return parts.join(" · ");
}

function landSummary(p?: PersonLike | null): string | null {
  if (!p?.has_land) return p?.has_land === false ? "No land" : null;
  const entries = Array.isArray((p as any).property_entries)
    ? ((p as any).property_entries as Record<string, unknown>[])
    : [];
  if (entries.length) {
    const bits = entries.map((row) => {
      const parts: string[] = [];
      if (row.property_type) {
        parts.push(String(row.property_type).replace(/_/g, " "));
      }
      if (row.property_area) parts.push(String(row.property_area));
      if (row.property_details) parts.push(String(row.property_details));
      return parts.join(" · ");
    });
    return `Yes · ${bits.filter(Boolean).join(" | ")}`;
  }
  const parts = ["Yes"];
  if (p.property_type) parts.push(String(p.property_type).replace(/_/g, " "));
  if ((p as any).property_area) parts.push(String((p as any).property_area));
  if (p.property_details) parts.push(String(p.property_details));
  return parts.join(" · ");
}

function pushClaim(
  items: AidInvestigationItem[],
  key: string,
  label: string,
  declared: string | null | undefined,
  required = false,
  section: AidInvestigationSection = "case",
) {
  const text = declared == null ? null : String(declared).trim();
  if (!text) return;
  items.push({
    key,
    label,
    declared: text,
    required,
    kind: "claim",
    allow_mismatch: true,
    section,
  });
}

function resolveFamilyHead(
  beneficiary: PersonLike | null | undefined,
  familyTree: FamilyTree | null | undefined,
  households:
    | ({ members?: HouseholdMember[]; head_person?: PersonLike | null } | null)[]
    | null
    | undefined,
  writerRelation?: string | null,
  writer?: PersonLike | null,
): PersonLike | null {
  for (const hh of households || []) {
    if (!hh) continue;
    if (hh.head_person) return hh.head_person;
    const head = (hh.members || []).find(
      (m) =>
        String(m.role_in_household || "").toLowerCase() === "head" && m.person,
    );
    if (head?.person) return head.person;
  }
  const parents = familyTree?.parents || [];
  if (parents[0]?.person) return parents[0].person;
  const rel = String(writerRelation || "").toLowerCase();
  if (
    writer &&
    ["father", "mother", "guardian", "relative", "other", "spouse"].includes(rel)
  ) {
    return writer;
  }
  return beneficiary || null;
}

export function buildInvestigationItems(ctx: {
  beneficiary?: PersonLike | null;
  writer?: PersonLike | null;
  writer_relation?: string | null;
  family_tree?: FamilyTree | null;
  family_counts?: Record<string, number> | null;
  households?: { members?: HouseholdMember[] }[] | null;
  request_summary?: string | null;
  requested_aid_type?: string | null;
}): AidInvestigationItem[] {
  const beneficiary = ctx.beneficiary || null;
  const familyTree = ctx.family_tree || {};
  const head = resolveFamilyHead(
    beneficiary,
    familyTree,
    ctx.households,
    ctx.writer_relation,
    ctx.writer,
  );
  const claims: AidInvestigationItem[] = [];

  if (head) {
    const idBits = [head.full_name, head.cnic].filter(Boolean).join(" · ");
    pushClaim(
      claims,
      "identity_of_head",
      "Identity of head",
      idBits || null,
      true,
      "family",
    );
  }

  if (beneficiary && beneficiary.id !== head?.id) {
    const idBits = [beneficiary.full_name, beneficiary.cnic]
      .filter(Boolean)
      .join(" · ");
    pushClaim(
      claims,
      "identity_of_beneficiary",
      "Identity of beneficiary",
      idBits || null,
      true,
      "beneficiary",
    );
  }

  const writer = ctx.writer || null;
  const writerRel = String(ctx.writer_relation || "").toLowerCase();
  if (
    writer &&
    writer.id &&
    writer.id !== beneficiary?.id &&
    writer.id !== head?.id
  ) {
    const idBits = [writer.full_name, writer.cnic].filter(Boolean).join(" · ");
    pushClaim(
      claims,
      "identity_of_applicant",
      "Identity of applicant",
      idBits
        ? `${idBits}${writerRel ? ` · relation: ${writerRel}` : ""}`
        : null,
      true,
      "applicant",
    );
  } else if (writerRel && writerRel !== "self" && head) {
    pushClaim(
      claims,
      "identity_of_applicant",
      "Identity of applicant",
      [head.full_name, head.cnic, `relation: ${writerRel}`]
        .filter(Boolean)
        .join(" · ") || null,
      false,
      "applicant",
    );
  }

  const addressBits = [
    beneficiary?.address,
    beneficiary?.city,
  ]
    .filter(Boolean)
    .join(", ");
  pushClaim(claims, "address", "Address", addressBits || null, true, "beneficiary");

  const hhMembers = new Set<number>();
  for (const hh of ctx.households || []) {
    for (const m of hh.members || []) {
      if (m.person?.id) hhMembers.add(m.person.id);
    }
  }
  const treeCount =
    (ctx.family_counts?.total_linked || 0) + (beneficiary ? 1 : 0);
  const size =
    hhMembers.size > 0
      ? hhMembers.size
      : treeCount > 0
        ? treeCount
        : null;
  if (size != null) {
    pushClaim(
      claims,
      "household_size",
      "Household size",
      `${size} member${size === 1 ? "" : "s"}`,
      true,
      "family",
    );
  }

  const incomePerson = head || beneficiary;
  pushClaim(
    claims,
    "monthly_household_income",
    "Monthly household income",
    money(incomePerson?.monthly_income),
    true,
    "family",
  );

  pushClaim(
    claims,
    "occupation",
    "Occupation / livelihood",
    incomePerson?.occupation || beneficiary?.occupation || null,
    false,
    "family",
  );

  const rentPerson = head || beneficiary;
  if (
    rentPerson?.resident_type === "rented" ||
    (rentPerson?.rented_amount != null && rentPerson.rented_amount !== "")
  ) {
    pushClaim(
      claims,
      "monthly_rent",
      "Monthly rent",
      money(rentPerson.rented_amount) || "Rented (amount not stated)",
      false,
      "family",
    );
  }

  pushClaim(
    claims,
    "resident_housing",
    "Resident / housing",
    residentSummary(head) || residentSummary(beneficiary),
    false,
    "family",
  );

  pushClaim(
    claims,
    "land_property",
    "Land / property",
    landSummary(head) || landSummary(beneficiary),
    false,
    "family",
  );

  pushClaim(
    claims,
    "livestock",
    "Livestock",
    livestockSummary(head) || livestockSummary(beneficiary),
    false,
    "family",
  );

  pushClaim(
    claims,
    "vehicle",
    "Vehicle",
    vehicleSummary(head) || vehicleSummary(beneficiary),
    false,
    "family",
  );

  const siblings = [
    ...(familyTree.brothers || []),
    ...(familyTree.sisters || []),
    ...(familyTree.siblings || []),
  ];
  pushClaim(claims, "siblings", "Siblings", listPeople(siblings), false, "family");

  pushClaim(
    claims,
    "children",
    "Children",
    listPeople(familyTree.children),
    false,
    "family",
  );

  pushClaim(
    claims,
    "spouse",
    "Spouse",
    listPeople(familyTree.spouse),
    false,
    "family",
  );

  const marital = String(beneficiary?.marital_status || "").toLowerCase();
  if (["widowed", "widow", "widower"].includes(marital)) {
    pushClaim(
      claims,
      "spouse_deceased",
      marital === "widower"
        ? "Spouse / wife deceased"
        : "Spouse / husband deceased",
      marital === "widower"
        ? "Widower (confirm death certificate / status on site)"
        : "Widow (confirm death certificate / status on site)",
      false,
      "beneficiary",
    );
  }

  const brothersSeparate = (familyTree.brothers || []).filter((b) =>
    /separat|own home|lives apart|independent/i.test(String(b.notes || "")),
  );
  if (brothersSeparate.length) {
    pushClaim(
      claims,
      "brother_lives_separately",
      "Brother lives separately",
      brothersSeparate
        .map((b) => {
          const name = b.person?.full_name || "Brother";
          return b.notes ? `${name} — ${b.notes}` : name;
        })
        .join("; "),
      false,
      "family",
    );
  }

  if (beneficiary?.has_disability) {
    pushClaim(
      claims,
      "disability",
      "Disability",
      beneficiary.disability_type
        ? `Yes · ${beneficiary.disability_type}`
        : "Yes",
      false,
      "beneficiary",
    );
  }

  if (beneficiary?.necta_status || head?.necta_status) {
    pushClaim(
      claims,
      "necta_status",
      "NECTA status",
      String(beneficiary?.necta_status || head?.necta_status).replace(
        /_/g,
        " ",
      ),
      false,
      head?.necta_status ? "family" : "beneficiary",
    );
  }

  if (beneficiary?.bisp_status || head?.bisp_status) {
    pushClaim(
      claims,
      "bisp_status",
      "BISP status",
      String(beneficiary?.bisp_status || head?.bisp_status).replace(/_/g, " "),
      false,
      head?.bisp_status ? "family" : "beneficiary",
    );
  }

  if (ctx.requested_aid_type || ctx.request_summary) {
    const aidBits = [
      ctx.requested_aid_type
        ? String(ctx.requested_aid_type).replace(/_/g, " ")
        : null,
      ctx.request_summary ? String(ctx.request_summary).slice(0, 160) : null,
    ]
      .filter(Boolean)
      .join(" — ");
    pushClaim(
      claims,
      "aid_request",
      "Aid request declared",
      aidBits,
      true,
      "case",
    );
  }

  // Fallback identity if somehow nothing else was claimed
  if (!claims.some((c) => c.key.startsWith("identity"))) {
    pushClaim(
      claims,
      "identity_of_beneficiary",
      "Identity of beneficiary",
      beneficiary
        ? [beneficiary.full_name, beneficiary.cnic].filter(Boolean).join(" · ")
        : "Not recorded",
      true,
      "beneficiary",
    );
  }

  const process = [...AID_INVESTIGATION_PROCESS_ITEMS];
  const siteVisit = process.find((i) => i.key === "site_visit");
  const restProcess = process.filter((i) => i.key !== "site_visit");
  return [
    ...(siteVisit ? [siteVisit] : []),
    ...claims,
    ...restProcess,
  ];
}

export function normalizeInvestigationEntry(
  value: unknown,
): AidInvestigationItemResult {
  if (value === true || value === "verified") {
    return { status: "verified", note: null };
  }
  if (value === false || value === "not_checked" || value == null) {
    return { status: "not_checked", note: null };
  }
  if (value === "mismatch") {
    return { status: "mismatch", note: null };
  }
  if (typeof value === "object" && value !== null) {
    const raw = value as Record<string, unknown>;
    const statusRaw = String(raw.status || "").toLowerCase();
    let status: AidInvestigationStatus = "not_checked";
    if (statusRaw === "verified" || statusRaw === "mismatch") {
      status = statusRaw;
    } else if (raw.checked === true || raw.ok === true) {
      status = "verified";
    }
    const note =
      typeof raw.note === "string"
        ? raw.note
        : typeof raw.notes === "string"
          ? raw.notes
          : typeof raw.found === "string"
            ? raw.found
            : null;
    const attachment_url =
      typeof raw.attachment_url === "string" ? raw.attachment_url : null;
    const attachment_name =
      typeof raw.attachment_name === "string" ? raw.attachment_name : null;
    const attachment_id =
      raw.attachment_id != null && Number.isFinite(Number(raw.attachment_id))
        ? Number(raw.attachment_id)
        : null;
    return { status, note, attachment_url, attachment_name, attachment_id };
  }
  return { status: "not_checked", note: null };
}

export function isInvestigationItemComplete(
  item: {
    key: string;
    required?: boolean;
    kind?: string;
    allow_mismatch?: boolean;
    accepts_file?: boolean;
  },
  entry: AidInvestigationItemResult,
): boolean {
  const hasNote = String(entry.note || "").trim().length >= 3;
  if (item.accepts_file) {
    const hasFile = !!String(entry.attachment_url || "").trim();
    if (!hasFile || entry.status !== "verified") return false;
    // Field process (e.g. Site Visit): Found note required with any status path
    if (item.kind === "process" && !hasNote) return false;
    return true;
  }
  if (item.kind === "process" || item.allow_mismatch === false) {
    if (entry.status !== "verified") return false;
    if (item.kind === "process" && !hasNote) return false;
    return true;
  }
  if (!item.required) {
    if (entry.status === "mismatch") {
      return hasNote;
    }
    return true;
  }
  if (entry.status === "verified") return true;
  if (entry.status === "mismatch") {
    return hasNote;
  }
  return false;
}

function checklistEntryForItem(
  checklist: Record<string, unknown>,
  key: string,
): unknown {
  if (checklist[key] !== undefined) return checklist[key];
  // Legacy key for Site Visit
  if (key === "site_visit" && checklist.home_visited !== undefined) {
    return checklist.home_visited;
  }
  return undefined;
}

export function assertInvestigationComplete(
  items: AidInvestigationItem[],
  checklist: Record<string, unknown> | null | undefined,
): Record<string, AidInvestigationItemResult> {
  if (!checklist || typeof checklist !== "object") {
    throw new Error("verification_checklist is required");
  }
  const payload: Record<string, AidInvestigationItemResult> = {};
  const missing: string[] = [];
  for (const item of items) {
    const entry = normalizeInvestigationEntry(
      checklistEntryForItem(checklist, item.key),
    );
    const noteTrimmed = entry.note ? String(entry.note).trim() : "";
    payload[item.key] = {
      status: entry.status,
      // Persist Found notes for field process at any status, and for claim mismatches
      note:
        item.kind === "process" ||
        entry.status === "mismatch" ||
        noteTrimmed
          ? noteTrimmed || null
          : null,
      attachment_url: entry.attachment_url || null,
      attachment_name: entry.attachment_name || null,
      attachment_id: entry.attachment_id ?? null,
    };
    if (!isInvestigationItemComplete(item, payload[item.key])) {
      missing.push(
        item.accepts_file
          ? `${item.label} (file + Found note required)`
          : item.kind === "process"
            ? `${item.label} (Verified + Found note)`
            : item.label,
      );
    }
  }
  if (missing.length) {
    throw new Error(
      `Complete investigation before verify: ${missing.join("; ")}. Field process and mismatches need a Found note.`,
    );
  }
  return payload;
}
