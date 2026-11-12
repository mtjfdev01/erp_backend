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
