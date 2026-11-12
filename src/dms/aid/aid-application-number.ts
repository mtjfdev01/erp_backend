import { AidRequestType } from "./aid.enums";

/**
 * Main-program application numbers: `{CODE}-{YY}-{####}`.
 * Assigned only when a draft is Considered (not at draft create).
 * Counters are per program code + year.
 */

/** Main program → 2-letter code (subprograms do not get their own codes). */
export const AID_PROGRAM_APP_NO_CODES: Record<string, string> = {
  [AidRequestType.RATION]: "RP",
  [AidRequestType.CLEAN_WATER]: "CW",
  [AidRequestType.EDUCATION]: "ED",
  [AidRequestType.COMMUNITY_SERVICES]: "CS",
  [AidRequestType.HEALTH]: "HE",
  [AidRequestType.APNA_GHAR]: "AG",
  [AidRequestType.DISASTER_RELIEF]: "DR",
  [AidRequestType.KASB_SKILL_DEVELOPMENT]: "KS",
  [AidRequestType.SEEDS_OF_CHANGE]: "SC",
  [AidRequestType.AAS_LAB_DIAGNOSTICS]: "AL",
  [AidRequestType.OTHER]: "OT",
  /** Legacy top-level types → Community Services */
  [AidRequestType.MARRIAGE_GIFT]: "CS",
  [AidRequestType.FINANCIAL_ASSISTANCE]: "CS",
  [AidRequestType.CASH]: "OT",
  [AidRequestType.MEDICAL]: "HE",
};

/**
 * Last manually issued sequence per code for year `26` (Excel books).
 * System issues the next number after these.
 */
export const AID_PROGRAM_APP_NO_SEED_LAST: Record<
  string,
  Record<string, number>
> = {
  "26": {
    RP: 192,
    CW: 94,
    ED: 19,
    CS: 53,
  },
};

const PROGRAM_APP_NO_RE = /^[A-Z]{2,3}-\d{2}-\d{4}$/;

export function resolveAidProgramAppNoCode(
  requestedAidType?: string | null,
): string {
  const key = String(requestedAidType || "")
    .trim()
    .toLowerCase();
  return AID_PROGRAM_APP_NO_CODES[key] || "OT";
}

export function isProgramApplicationNo(value?: string | null): boolean {
  return PROGRAM_APP_NO_RE.test(String(value || "").trim().toUpperCase());
}

export function aidAppNoYearSuffix(date = new Date()): string {
  return String(date.getFullYear()).slice(-2);
}

export function aidAppNoSeedLast(code: string, yearSuffix: string): number {
  const byYear = AID_PROGRAM_APP_NO_SEED_LAST[yearSuffix];
  if (!byYear) return 0;
  const n = Number(byYear[String(code || "").toUpperCase()]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatAidProgramApplicationNo(
  code: string,
  yearSuffix: string,
  seq: number,
): string {
  return `${String(code).toUpperCase()}-${yearSuffix}-${String(seq).padStart(4, "0")}`;
}

/** True for legacy daily counters like AID-20261102-0002. */
export function isLegacyAidApplicationNo(value?: string | null): boolean {
  const no = String(value || "").trim().toUpperCase();
  if (!no) return false;
  if (isProgramApplicationNo(no)) return false;
  return no.startsWith("AID-") || /^TMP-REMAP-\d+$/i.test(no);
}

/**
 * Draft / pre-consider intake should not keep an official application number.
 */
export function shouldClearApplicationNoForStatus(params: {
  status?: string | null;
  submittedAt?: Date | string | null;
}): boolean {
  const status = String(params.status || "").toLowerCase();
  const submitted = !!params.submittedAt;
  if (status === "draft") return true;
  if (status === "incomplete_docs" && !submitted) return true;
  if (status === "incomplete" && !submitted) return true;
  return false;
}

export type AidAppNoRemapRow = {
  id: number;
  requested_aid_type?: string | null;
  status?: string | null;
  submitted_at?: Date | string | null;
  created_at?: Date | string | null;
  application_no?: string | null;
};

export type AidAppNoRemapPlan = {
  clearIds: number[];
  assign: Array<{ id: number; application_no: string; code: string }>;
};

/**
 * Build remap plan for legacy AID-* rows:
 * - drafts / unsubmitted incomplete → clear number
 * - considered (or other pipeline) → assign CODE-YY-#### after seed last
 */
export function buildAidApplicationNoRemapPlan(
  rows: AidAppNoRemapRow[],
  yearSuffix = aidAppNoYearSuffix(),
  /** Highest sequence already used per code (from existing CODE-YY-#### rows). */
  existingMaxByCode: Record<string, number> = {},
): AidAppNoRemapPlan {
  const clearIds: number[] = [];
  const toAssign: AidAppNoRemapRow[] = [];

  for (const row of rows) {
    const no = row.application_no;
    const needsTouch =
      !no ||
      isLegacyAidApplicationNo(no) ||
      !isProgramApplicationNo(no);
    if (!needsTouch) continue;

    if (
      shouldClearApplicationNoForStatus({
        status: row.status,
        submittedAt: row.submitted_at,
      })
    ) {
      // Only clear when there is something to clear
      if (no) clearIds.push(Number(row.id));
      continue;
    }

    // Already a valid program number — leave alone
    if (isProgramApplicationNo(no)) continue;

    toAssign.push(row);
  }

  toAssign.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });

  const nextByCode: Record<string, number> = {};
  const assign: AidAppNoRemapPlan["assign"] = [];

  for (const row of toAssign) {
    const code = resolveAidProgramAppNoCode(row.requested_aid_type);
    if (nextByCode[code] == null) {
      const seedLast = aidAppNoSeedLast(code, yearSuffix);
      const existingLast = Number(existingMaxByCode[code] || 0);
      const floor = Math.max(seedLast, existingLast);
      nextByCode[code] = floor + 1;
    }
    const seq = nextByCode[code];
    nextByCode[code] = seq + 1;
    assign.push({
      id: Number(row.id),
      code,
      application_no: formatAidProgramApplicationNo(code, yearSuffix, seq),
    });
  }

  return { clearIds, assign };
}
