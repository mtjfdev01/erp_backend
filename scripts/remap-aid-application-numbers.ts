/**
 * One-time remap: AID-YYYYMMDD-#### → CODE-YY-#### after Excel seed counters.
 * Drafts / unsubmitted incomplete → application_no = null.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/remap-aid-application-numbers.ts
 */
import { config } from "dotenv";
import { Client } from "pg";
import {
  aidAppNoYearSuffix,
  buildAidApplicationNoRemapPlan,
  isLegacyAidApplicationNo,
  isProgramApplicationNo,
} from "../src/dms/aid/aid-application-number";

config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const yy = aidAppNoYearSuffix();
    const existing = await client.query(
      `
      SELECT application_no
      FROM aid_applications
      WHERE is_archived = false
        AND application_no ~ ('^[A-Za-z]{2,3}-' || $1 || '-[0-9]{4}$')
      `,
      [yy],
    );
    const existingMaxByCode: Record<string, number> = {};
    for (const r of existing.rows) {
      const parts = String(r.application_no || "").toUpperCase().split("-");
      if (parts.length !== 3) continue;
      const [code, , seqRaw] = parts;
      const seq = Number(seqRaw);
      if (!Number.isFinite(seq)) continue;
      existingMaxByCode[code] = Math.max(existingMaxByCode[code] || 0, seq);
    }

    const { rows } = await client.query(
      `
      SELECT
        id,
        requested_aid_type,
        status,
        submitted_at,
        created_at,
        application_no
      FROM aid_applications
      WHERE is_archived = false
        AND (
          application_no IS NULL
          OR application_no ILIKE 'AID-%'
          OR application_no ILIKE 'TMP-REMAP-%'
          OR application_no !~ '^[A-Za-z]{2,3}-[0-9]{2}-[0-9]{4}$'
        )
      ORDER BY created_at ASC NULLS LAST, id ASC
      `,
    );

    const plan = buildAidApplicationNoRemapPlan(rows, yy, existingMaxByCode);

    console.log(
      `Found ${rows.length} candidate row(s); clear=${plan.clearIds.length}, assign=${plan.assign.length}`,
    );

    if (!plan.clearIds.length && !plan.assign.length) {
      console.log("Nothing to remap.");
      return;
    }

    await client.query("BEGIN");

    // Free unique indexes before assigning new numbers
    const touchIds = [
      ...plan.clearIds,
      ...plan.assign.map((a) => a.id),
    ];
    if (touchIds.length) {
      await client.query(
        `
        UPDATE aid_applications
        SET application_no = 'TMP-REMAP-' || id::text,
            updated_at = NOW()
        WHERE id = ANY($1::int[])
        `,
        [touchIds],
      );
    }

    if (plan.clearIds.length) {
      await client.query(
        `
        UPDATE aid_applications
        SET application_no = NULL,
            updated_at = NOW()
        WHERE id = ANY($1::int[])
        `,
        [plan.clearIds],
      );
    }

    for (const row of plan.assign) {
      await client.query(
        `
        UPDATE aid_applications
        SET application_no = $2,
            updated_at = NOW()
        WHERE id = $1
        `,
        [row.id, row.application_no],
      );
      await client.query(
        `
        UPDATE aid_application_audit_logs
        SET application_no = $2
        WHERE application_id = $1
          AND (
            application_no IS NULL
            OR application_no ILIKE 'AID-%'
            OR application_no ILIKE 'TMP-REMAP-%'
          )
        `,
        [row.id, row.application_no],
      );
      console.log(`#${row.id} → ${row.application_no} (${row.code})`);
    }

    await client.query("COMMIT");

    const verify = await client.query(
      `
      SELECT application_no, requested_aid_type, status, COUNT(*)::int AS n
      FROM aid_applications
      WHERE is_archived = false
        AND application_no IS NOT NULL
      GROUP BY 1, 2, 3
      ORDER BY 1
      LIMIT 50
      `,
    );
    console.log("Sample after remap:");
    for (const r of verify.rows) {
      const ok =
        isProgramApplicationNo(r.application_no) &&
        !isLegacyAidApplicationNo(r.application_no);
      console.log(
        `  ${r.application_no}  ${r.requested_aid_type}/${r.status} x${r.n}${ok ? "" : "  << unexpected"}`,
      );
    }

    const leftover = await client.query(
      `
      SELECT COUNT(*)::int AS n
      FROM aid_applications
      WHERE is_archived = false
        AND application_no ILIKE 'AID-%'
      `,
    );
    console.log(`Remaining AID-* rows: ${leftover.rows[0].n}`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
