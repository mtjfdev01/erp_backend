/** Shared stamp for donations / installments / box collections. */
export type ReconciledStatus = "approved" | "rejected";

export function reconciliationStamp(
  userId: number | null | undefined,
  status: ReconciledStatus,
): {
  reconciled_by: number | null;
  reconciled_at: Date;
  reconciled_status: ReconciledStatus;
} {
  const id = userId != null && Number.isFinite(Number(userId)) ? Number(userId) : null;
  return {
    reconciled_by: id,
    reconciled_at: new Date(),
    reconciled_status: status,
  };
}

export function reconciledStatusFromOutcome(
  outcome: string,
): ReconciledStatus {
  const s = String(outcome || "").toLowerCase();
  if (
    s === "completed" ||
    s === "verified" ||
    s === "deposited" ||
    s === "active" ||
    s === "approved" ||
    s === "success" ||
    s === "paid"
  ) {
    return "approved";
  }
  return "rejected";
}
