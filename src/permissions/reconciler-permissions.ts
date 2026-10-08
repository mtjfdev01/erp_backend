/**
 * Shared reconciler permission checks for donations / box collections / recurring.
 * Non-reconciler staff may only create or keep status as "pending".
 * Donation reconciler is scoped: online / offline / in_kind separately.
 */

import { ForbiddenException } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";
import { RECURRING_DONATION_RECONCILER_PERMISSIONS } from "./recurring-donations-permissions.constants";

export const BOX_COLLECTION_RECONCILER_PERMISSION =
  "fund_raising.donation_box_donations.reconciler";

const PENDING = "pending";

export type DonationReconcileChannel = "online" | "offline" | "in_kind";

export function resolveDonationReconcileChannel(input?: {
  channel?: string | null;
  donation_method?: string | null;
  donation_source?: string | null;
}): DonationReconcileChannel {
  const method = String(input?.donation_method || "").toLowerCase();
  if (method === "in_kind" || input?.channel === "in_kind") return "in_kind";
  if (input?.channel === "online") return "online";
  if (input?.channel === "offline" || input?.channel === "csr") return "offline";
  const source = String(input?.donation_source || "").toLowerCase();
  if (source === "website") return "online";
  return "offline";
}

export function donationReconcilerPermissionFor(
  channel: DonationReconcileChannel,
): string {
  if (channel === "online") return "fund_raising.online_donations.reconciler";
  if (channel === "in_kind") return "fund_raising.in_kind_donations.reconciler";
  return "fund_raising.offline_donations.reconciler";
}

export function normalizeStatus(status: unknown): string {
  return String(status || PENDING)
    .trim()
    .toLowerCase();
}

/** True when resulting status is non-pending, or changing an existing non-pending row. */
export function statusChangeRequiresReconciler(
  nextStatus: unknown,
  previousStatus?: unknown,
): boolean {
  const next = normalizeStatus(nextStatus);
  if (next !== PENDING) return true;
  if (previousStatus == null || previousStatus === undefined) return false;
  const prev = normalizeStatus(previousStatus);
  // Changing away from a verified status (e.g. completed → pending) also needs reconciler
  return prev !== PENDING && prev !== next;
}

async function userHasAnyPermission(
  permissionsService: PermissionsService,
  userId: number,
  paths: readonly string[],
): Promise<boolean> {
  for (const path of paths) {
    if (await permissionsService.hasPermission(userId, path)) return true;
  }
  return false;
}

async function assertReconciler(
  permissionsService: PermissionsService,
  user: any,
  paths: readonly string[],
  message: string,
): Promise<void> {
  const userId = Number(user?.id);
  // System / webhook / public flows (no staff user)
  if (!Number.isFinite(userId) || userId <= 0 || userId === -1) return;

  if (await permissionsService.hasPermission(userId, "super_admin")) return;
  if (await permissionsService.hasPermission(userId, "fund_raising_manager"))
    return;
  if (await userHasAnyPermission(permissionsService, userId, paths)) return;

  throw new ForbiddenException(message);
}

export async function assertDonationReconciler(
  permissionsService: PermissionsService,
  user: any,
  nextStatus: unknown,
  previousStatus?: unknown,
  /** In-kind may also use fund_raising.in_kind_donations.completing for completed. */
  allowInKindCompleting = false,
  /** Scope reconciler to online / offline / in_kind. */
  channelInput?: {
    channel?: string | null;
    donation_method?: string | null;
    donation_source?: string | null;
  },
): Promise<void> {
  if (!statusChangeRequiresReconciler(nextStatus, previousStatus)) return;

  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0 || userId === -1) return;

  const channel = resolveDonationReconcileChannel({
    ...channelInput,
    donation_method:
      channelInput?.donation_method ??
      (allowInKindCompleting ? "in_kind" : undefined),
  });

  if (allowInKindCompleting || channel === "in_kind") {
    const next = normalizeStatus(nextStatus);
    if (["completed", "paid", "success"].includes(next)) {
      if (
        (await permissionsService.hasPermission(
          userId,
          "fund_raising.in_kind_donations.completing",
        )) ||
        (await permissionsService.hasPermission(
          userId,
          "fund_raising.in_kind_donations.reconciler",
        ))
      ) {
        return;
      }
    }
  }

  await assertReconciler(
    permissionsService,
    user,
    [donationReconcilerPermissionFor(channel)],
    "Only a reconciler can set or change donation status away from pending",
  );
}

export async function assertBoxCollectionReconciler(
  permissionsService: PermissionsService,
  user: any,
  nextStatus: unknown,
  previousStatus?: unknown,
): Promise<void> {
  if (!statusChangeRequiresReconciler(nextStatus, previousStatus)) return;
  await assertReconciler(
    permissionsService,
    user,
    [BOX_COLLECTION_RECONCILER_PERMISSION],
    "Only a reconciler can set or change collection status away from pending",
  );
}

export async function assertRecurringReconciler(
  permissionsService: PermissionsService,
  user: any,
  nextStatus: unknown,
  previousStatus?: unknown,
): Promise<void> {
  if (!statusChangeRequiresReconciler(nextStatus, previousStatus)) return;
  await assertReconciler(
    permissionsService,
    user,
    RECURRING_DONATION_RECONCILER_PERMISSIONS,
    "Only a reconciler can set or change installment status away from pending",
  );
}
