import {
  AID_AUDIT_PATCH_FIELDS,
  AID_AUDIT_SKIP_KEYS,
} from "./aid-audit.constants";
import { AidAuditChange } from "./aid-audit.types";

export function aidAuditUserId(userId?: number | null): number | null {
  if (userId == null) return null;
  const n = Number(userId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function serializeAidAuditValue(
  value: unknown,
): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeForCompare(value: unknown): string {
  const s = serializeAidAuditValue(value);
  if (s === null) return "";
  return String(s);
}

export function buildAidFieldChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  allowedFields: readonly string[] = AID_AUDIT_PATCH_FIELDS,
): AidAuditChange[] {
  const changes: AidAuditChange[] = [];
  for (const key of Object.keys(patch)) {
    if (AID_AUDIT_SKIP_KEYS.has(key)) continue;
    if (!(allowedFields as readonly string[]).includes(key)) continue;
    const oldRaw = before[key];
    const newRaw = patch[key];
    if (normalizeForCompare(oldRaw) === normalizeForCompare(newRaw)) continue;
    changes.push({
      field: key,
      old_value: serializeAidAuditValue(oldRaw),
      new_value: serializeAidAuditValue(newRaw),
    });
  }
  return changes;
}

export function buildAidStatusChange(
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
): AidAuditChange[] {
  if (normalizeForCompare(oldStatus) === normalizeForCompare(newStatus)) {
    return [];
  }
  return [
    {
      field: "status",
      old_value: serializeAidAuditValue(oldStatus),
      new_value: serializeAidAuditValue(newStatus),
    },
  ];
}

/** Summarize investigation checklist item statuses for audit diffs. */
export function buildChecklistStatusChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AidAuditChange[] {
  const changes: AidAuditChange[] = [];
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  for (const key of keys) {
    const b = (before || {})[key];
    const a = (after || {})[key];
    const oldStatus =
      b && typeof b === "object"
        ? String((b as any).status || "")
        : b === true
          ? "verified"
          : "";
    const newStatus =
      a && typeof a === "object"
        ? String((a as any).status || "")
        : a === true
          ? "verified"
          : "";
    if (normalizeForCompare(oldStatus) === normalizeForCompare(newStatus)) {
      continue;
    }
    changes.push({
      field: `checklist.${key}.status`,
      old_value: serializeAidAuditValue(oldStatus || null),
      new_value: serializeAidAuditValue(newStatus || null),
    });

    const oldNote =
      b && typeof b === "object" ? String((b as any).note || "") : "";
    const newNote =
      a && typeof a === "object" ? String((a as any).note || "") : "";
    if (
      normalizeForCompare(oldNote) !== normalizeForCompare(newNote) &&
      (oldNote || newNote)
    ) {
      changes.push({
        field: `checklist.${key}.note`,
        old_value: serializeAidAuditValue(oldNote || null),
        new_value: serializeAidAuditValue(newNote || null),
      });
    }

    const oldGps =
      b && typeof b === "object"
        ? String((b as any).gps_coordinates || "")
        : "";
    const newGps =
      a && typeof a === "object"
        ? String((a as any).gps_coordinates || "")
        : "";
    if (normalizeForCompare(oldGps) !== normalizeForCompare(newGps)) {
      changes.push({
        field: `checklist.${key}.gps_coordinates`,
        old_value: serializeAidAuditValue(oldGps || null),
        new_value: serializeAidAuditValue(newGps || null),
      });
    }
  }
  return changes;
}

export function buildJsonObjectChanges(
  fieldPrefix: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys: string[],
): AidAuditChange[] {
  const changes: AidAuditChange[] = [];
  for (const key of keys) {
    const oldRaw = before?.[key];
    const newRaw = after?.[key];
    if (normalizeForCompare(oldRaw) === normalizeForCompare(newRaw)) continue;
    changes.push({
      field: `${fieldPrefix}.${key}`,
      old_value: serializeAidAuditValue(oldRaw ?? null),
      new_value: serializeAidAuditValue(newRaw ?? null),
    });
  }
  return changes;
}
