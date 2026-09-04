import {
  CSR_DONOR_AUDIT_PATCH_FIELDS,
  CSR_DONOR_AUDIT_SKIP_KEYS,
} from "./csr-donor-audit.constants";
import { DonorAuditChange } from "../../donor/audit/donor-audit.types";
import { serializeDonorAuditValue } from "../../donor/audit/donor-audit.util";

function normalizeForCompare(value: unknown): string {
  const s = serializeDonorAuditValue(value);
  if (s === null) return "";
  return String(s);
}

export function buildCsrDonorFieldChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): DonorAuditChange[] {
  const changes: DonorAuditChange[] = [];

  for (const key of Object.keys(patch)) {
    if (CSR_DONOR_AUDIT_SKIP_KEYS.has(key)) continue;
    if (!(CSR_DONOR_AUDIT_PATCH_FIELDS as readonly string[]).includes(key)) {
      continue;
    }

    const oldRaw = before[key];
    const newRaw = patch[key];
    if (normalizeForCompare(oldRaw) === normalizeForCompare(newRaw)) {
      continue;
    }

    changes.push({
      field: key,
      old_value: serializeDonorAuditValue(oldRaw),
      new_value: serializeDonorAuditValue(newRaw),
    });
  }

  return changes;
}

export function csrDonorAuditSnapshot(org: Record<string, unknown>) {
  const snap: Record<string, unknown> = {};
  for (const key of CSR_DONOR_AUDIT_PATCH_FIELDS) {
    snap[key] = org[key];
  }
  return snap;
}
