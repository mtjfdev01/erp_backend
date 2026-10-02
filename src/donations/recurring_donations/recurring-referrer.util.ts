import { Repository } from "typeorm";

/**
 * Referrer for a recurring subscription: initial donation's referred_by,
 * else the donor's referred_by. Returns a users.id or null.
 */
export async function resolveRecurringReferrerUserId(
  repo: Repository<any>,
  params: { donationId?: number | null; donorId?: number | null },
): Promise<number | null> {
  const donationId = Number(params.donationId) || 0;
  const donorId = Number(params.donorId) || 0;

  if (donationId > 0) {
    const rows = await repo.query(
      `SELECT "referred_by" AS id FROM "donations" WHERE "id" = $1 LIMIT 1`,
      [donationId],
    );
    const id = Number(rows?.[0]?.id);
    if (Number.isFinite(id) && id > 0) return id;
  }

  if (donorId > 0) {
    const rows = await repo.query(
      `SELECT "referred_by" AS id FROM "donors" WHERE "id" = $1 LIMIT 1`,
      [donorId],
    );
    const id = Number(rows?.[0]?.id);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}

/** Relation payload for donations.referred_by (ManyToOne User). */
export function referrerRelation(userId?: number | null) {
  const id = Number(userId) || 0;
  return id > 0 ? { referred_by: { id } as any } : {};
}
