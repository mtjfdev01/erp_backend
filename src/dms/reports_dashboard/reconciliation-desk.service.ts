import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  COMPLETED_DONATION_STATUSES,
  FAILED_DONATION_STATUSES,
  PENDING_DONATION_STATUSES,
  formatCount,
  formatPkrCompact,
  monthBounds,
  toNumber,
} from "./report-format.util";

@Injectable()
export class ReconciliationDeskService {
  constructor(private readonly dataSource: DataSource) {}

  private async q(sql: string, params: any[] = []): Promise<any[]> {
    try {
      return await this.dataSource.query(sql, params);
    } catch {
      return [];
    }
  }

  private oldestTone(days: number): "default" | "amber" | "red" {
    if (days >= 8) return "red";
    if (days >= 3) return "amber";
    return "default";
  }

  async getDesk() {
    const bounds = monthBounds();
    const pendingIn = PENDING_DONATION_STATUSES.map((s) => `'${s}'`).join(",");
    const failedIn = FAILED_DONATION_STATUSES.map((s) => `'${s}'`).join(",");
    const asOf = new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const completedIn = COMPLETED_DONATION_STATUSES.map((s) => `'${s}'`).join(
      ",",
    );

    // Channel segregation: offline / in-kind / recurring
    // Rejected = reconciliation stamp only (reconciled_status), not failed/cancelled outcomes
    const channelRows = await this.q(`
      SELECT
        channel,
        pending_cnt,
        completed_cnt,
        rejected_cnt,
        pending_amount,
        completed_amount,
        rejected_amount
      FROM (
        SELECT
          'offline'::text AS channel,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${pendingIn})
          )::int AS pending_cnt,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${completedIn})
          )::int AS completed_cnt,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(reconciled_status, '')) = 'rejected'
          )::int AS rejected_cnt,
          COALESCE(SUM(COALESCE(paid_amount, amount, 0)) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${pendingIn})
          ), 0) AS pending_amount,
          COALESCE(SUM(COALESCE(paid_amount, amount, 0)) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${completedIn})
          ), 0) AS completed_amount,
          COALESCE(SUM(COALESCE(paid_amount, amount, 0)) FILTER (
            WHERE LOWER(COALESCE(reconciled_status, '')) = 'rejected'
          ), 0) AS rejected_amount
        FROM donations
        WHERE is_archived = false
          AND LOWER(COALESCE(donation_source, '')) != 'website'
          AND LOWER(COALESCE(donation_method, '')) != 'in_kind'

        UNION ALL

        SELECT
          'in_kind'::text AS channel,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${pendingIn})
          )::int AS pending_cnt,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${completedIn})
          )::int AS completed_cnt,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(reconciled_status, '')) = 'rejected'
          )::int AS rejected_cnt,
          COALESCE(SUM(COALESCE(paid_amount, amount, 0)) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${pendingIn})
          ), 0) AS pending_amount,
          COALESCE(SUM(COALESCE(paid_amount, amount, 0)) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (${completedIn})
          ), 0) AS completed_amount,
          COALESCE(SUM(COALESCE(paid_amount, amount, 0)) FILTER (
            WHERE LOWER(COALESCE(reconciled_status, '')) = 'rejected'
          ), 0) AS rejected_amount
        FROM donations
        WHERE is_archived = false
          AND LOWER(COALESCE(donation_method, '')) = 'in_kind'

        UNION ALL

        SELECT
          'recurring'::text AS channel,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) = 'pending'
          )::int AS pending_cnt,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (
              'active', 'completed', 'paid', 'success', 'verified'
            )
          )::int AS completed_cnt,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(reconciled_status, '')) = 'rejected'
          )::int AS rejected_cnt,
          COALESCE(SUM(COALESCE(amount, 0)) FILTER (
            WHERE LOWER(COALESCE(status, '')) = 'pending'
          ), 0) AS pending_amount,
          COALESCE(SUM(COALESCE(amount, 0)) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (
              'active', 'completed', 'paid', 'success', 'verified'
            )
          ), 0) AS completed_amount,
          COALESCE(SUM(COALESCE(amount, 0)) FILTER (
            WHERE LOWER(COALESCE(reconciled_status, '')) = 'rejected'
          ), 0) AS rejected_amount
        FROM recurring_donations
        WHERE is_archived = false
      ) channel_stats
    `);

    const channelLabels: Record<string, string> = {
      offline: "Offline",
      in_kind: "In Kind",
      recurring: "Recurring",
    };
    const channelOrder = ["offline", "in_kind", "recurring"];
    const channelMap = new Map(
      (channelRows || []).map((r) => [String(r.channel), r]),
    );
    const channelBreakdownItems = channelOrder.map((id) => {
      const row = channelMap.get(id) || {};
      return {
        id,
        label: channelLabels[id] || id,
        pending: toNumber(row.pending_cnt),
        completed: toNumber(row.completed_cnt),
        rejected: toNumber(row.rejected_cnt),
        pending_amount_formatted: formatPkrCompact(
          toNumber(row.pending_amount),
        ),
        completed_amount_formatted: formatPkrCompact(
          toNumber(row.completed_amount),
        ),
        rejected_amount_formatted: formatPkrCompact(
          toNumber(row.rejected_amount),
        ),
      };
    });

    // Pending donations (online + offline)
    const donationPending = await this.q(`
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(COALESCE(paid_amount, amount, 0)), 0) AS total,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS older_7,
        COUNT(*) FILTER (
          WHERE created_at >= NOW() - INTERVAL '3 days'
        )::int AS age_0_2,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '3 days'
            AND created_at >= NOW() - INTERVAL '8 days'
        )::int AS age_3_7,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '8 days'
            AND created_at >= NOW() - INTERVAL '15 days'
        )::int AS age_8_14,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '15 days'
            AND created_at >= NOW() - INTERVAL '31 days'
        )::int AS age_15_30,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '31 days'
        )::int AS age_30_plus
      FROM donations
      WHERE is_archived = false
        AND LOWER(COALESCE(status, '')) IN (${pendingIn})
    `);

    const boxPending = await this.q(`
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(COALESCE(collection_amount, 0)), 0) AS total,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS older_7,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '3 days')::int AS age_0_2,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '3 days'
            AND created_at >= NOW() - INTERVAL '8 days'
        )::int AS age_3_7,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '8 days'
            AND created_at >= NOW() - INTERVAL '15 days'
        )::int AS age_8_14,
        COUNT(*) FILTER (
          WHERE created_at < NOW() - INTERVAL '15 days'
            AND created_at >= NOW() - INTERVAL '31 days'
        )::int AS age_15_30,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '31 days')::int AS age_30_plus
      FROM donation_box_donations
      WHERE is_archived = false
        AND status = 'pending'
    `);

    const recurringPending = await this.q(`
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(COALESCE(amount, 0)), 0) AS total,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS older_7
      FROM recurring_donations
      WHERE is_archived = false
        AND LOWER(COALESCE(status, '')) = 'pending'
    `);

    const pendingCount =
      toNumber(donationPending[0]?.cnt) +
      toNumber(boxPending[0]?.cnt) +
      toNumber(recurringPending[0]?.cnt);
    const pendingAmount =
      toNumber(donationPending[0]?.total) +
      toNumber(boxPending[0]?.total) +
      toNumber(recurringPending[0]?.total);
    const older7 =
      toNumber(donationPending[0]?.older_7) +
      toNumber(boxPending[0]?.older_7) +
      toNumber(recurringPending[0]?.older_7);

    // Verified / completed today
    const verifiedToday = await this.q(`
      SELECT
        (
          SELECT COUNT(*)::int FROM donations
          WHERE is_archived = false
            AND LOWER(COALESCE(status, '')) IN ('completed', 'success', 'paid', 'verified')
            AND DATE(COALESCE(updated_at, created_at)) = CURRENT_DATE
        ) + (
          SELECT COUNT(*)::int FROM donation_box_donations
          WHERE is_archived = false
            AND status IN ('verified', 'deposited')
            AND DATE(COALESCE(verified_at, updated_at, created_at)) = CURRENT_DATE
        ) AS cnt,
        (
          SELECT COALESCE(SUM(COALESCE(paid_amount, amount, 0)), 0) FROM donations
          WHERE is_archived = false
            AND LOWER(COALESCE(status, '')) IN ('completed', 'success', 'paid', 'verified')
            AND DATE(COALESCE(updated_at, created_at)) = CURRENT_DATE
        ) + (
          SELECT COALESCE(SUM(COALESCE(collection_amount, 0)), 0) FROM donation_box_donations
          WHERE is_archived = false
            AND status IN ('verified', 'deposited')
            AND DATE(COALESCE(verified_at, updated_at, created_at)) = CURRENT_DATE
        ) AS total
    `);

    // Reconciliation rejects this month (stamp only — not failed/cancelled outcomes)
    const rejectedMonth = await this.q(
      `
      SELECT
        (
          SELECT COUNT(*)::int FROM donations
          WHERE is_archived = false
            AND LOWER(COALESCE(reconciled_status, '')) = 'rejected'
            AND COALESCE(reconciled_at::date, date, created_at::date) >= $1::date
            AND COALESCE(reconciled_at::date, date, created_at::date) <= $2::date
        ) + (
          SELECT COUNT(*)::int FROM donation_box_donations
          WHERE is_archived = false
            AND LOWER(COALESCE(reconciled_status, '')) = 'rejected'
            AND COALESCE(reconciled_at::date, collection_date, created_at::date) >= $1::date
            AND COALESCE(reconciled_at::date, collection_date, created_at::date) <= $2::date
        ) + (
          SELECT COUNT(*)::int FROM recurring_donations
          WHERE is_archived = false
            AND LOWER(COALESCE(reconciled_status, '')) = 'rejected'
            AND COALESCE(reconciled_at::date, created_at::date) >= $1::date
            AND COALESCE(reconciled_at::date, created_at::date) <= $2::date
        ) AS cnt
      `,
      [bounds.start, bounds.end],
    );

    // PayFast / website checkout outcome for current month
    const payfast = await this.q(
      `
      SELECT
        COUNT(*)::int AS started,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN ('completed', 'success', 'paid')
        )::int AS completed,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN (${pendingIn})
        )::int AS pending,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN (${failedIn})
        )::int AS failed,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN ('cancelled', 'canceled')
        )::int AS cancelled
      FROM donations
      WHERE is_archived = false
        AND LOWER(COALESCE(donation_source, '')) = 'website'
        AND date >= $1::date AND date <= $2::date
      `,
      [bounds.start, bounds.end],
    );
    const started = toNumber(payfast[0]?.started) || 1;
    const pfCompleted = toNumber(payfast[0]?.completed);
    const pfPending = toNumber(payfast[0]?.pending);
    const pfFailed = toNumber(payfast[0]?.failed);
    const pfCancelled = toNumber(payfast[0]?.cancelled);
    const successPct = (pfCompleted / started) * 100;

    // Pending by method
    const methodRows = await this.q(`
      SELECT
        CASE
          WHEN LOWER(COALESCE(donation_source, '')) = 'website' THEN 'PayFast (pending)'
          WHEN LOWER(COALESCE(donation_method, '')) IN ('cash') THEN 'Cash'
          WHEN LOWER(COALESCE(donation_method, '')) IN ('cheque', 'check') THEN 'Cheque'
          WHEN LOWER(COALESCE(donation_method, '')) IN ('bank_transfer', 'bank', 'transfer', 'ibft')
            THEN 'Bank transfer'
          ELSE 'Manual entry'
        END AS method,
        COUNT(*)::int AS records,
        COALESCE(SUM(COALESCE(paid_amount, amount, 0)), 0) AS amount,
        COALESCE(MAX(EXTRACT(DAY FROM (NOW() - created_at))), 0)::int AS oldest_days
      FROM donations
      WHERE is_archived = false
        AND LOWER(COALESCE(status, '')) IN (${pendingIn})
      GROUP BY 1
      ORDER BY amount DESC
    `);

    const age0_2 =
      toNumber(donationPending[0]?.age_0_2) + toNumber(boxPending[0]?.age_0_2);
    const age3_7 =
      toNumber(donationPending[0]?.age_3_7) + toNumber(boxPending[0]?.age_3_7);
    const age8_14 =
      toNumber(donationPending[0]?.age_8_14) +
      toNumber(boxPending[0]?.age_8_14);
    const age15_30 =
      toNumber(donationPending[0]?.age_15_30) +
      toNumber(boxPending[0]?.age_15_30);
    const age30 =
      toNumber(donationPending[0]?.age_30_plus) +
      toNumber(boxPending[0]?.age_30_plus);

    return {
      sample_data: false,
      badge: "Live DMS queue",
      subtitle: `Accounts department · everything waiting to be verified against bank, PayFast and cash records · as of ${asOf}`,
      cards: {
        pending_verification: {
          title: "Pending verification",
          value: formatCount(pendingCount),
          value_tone: "amber",
          footer: `${formatPkrCompact(pendingAmount)} waiting`,
        },
        older_than_7_days: {
          title: "Older than 7 days",
          value: formatCount(older7),
          value_tone: "red",
          footer: "Target: zero",
        },
        verified_today: {
          title: "Verified today",
          value: formatCount(toNumber(verifiedToday[0]?.cnt)),
          value_tone: "green",
          footer: `${formatPkrCompact(toNumber(verifiedToday[0]?.total))} cleared`,
        },
        rejected_this_month: {
          title: "Rejected this month",
          value: formatCount(toNumber(rejectedMonth[0]?.cnt)),
          value_tone: "default",
          footer: bounds.label,
        },
        payfast_success: {
          title: "PayFast success",
          value: `${successPct.toFixed(1)}%`,
          value_tone: "blue",
          footer: "of checkouts started",
        },
      },
      pending_by_age: {
        title: "Pending by age",
        subtitle: "Records waiting for verification",
        items: [
          { id: "0_2", label: "0–2 days", count: age0_2, tone: "blue" },
          { id: "3_7", label: "3–7 days", count: age3_7, tone: "blue" },
          { id: "8_14", label: "8–14 days", count: age8_14, tone: "amber" },
          { id: "15_30", label: "15–30 days", count: age15_30, tone: "rose" },
          { id: "30_plus", label: "30+ days", count: age30, tone: "red" },
        ],
      },
      pending_by_method: {
        title: "Pending by method",
        subtitle: "Where the verification load sits",
        columns: ["Method", "Records", "Amount", "Oldest"],
        items: methodRows.map((r, idx) => {
          const days = toNumber(r.oldest_days);
          return {
            id: `m${idx}`,
            method: String(r.method),
            records: toNumber(r.records),
            amount_formatted: formatPkrCompact(toNumber(r.amount)),
            oldest: `${days} day${days === 1 ? "" : "s"}`,
            oldest_tone: this.oldestTone(days),
          };
        }),
      },
      channel_breakdown: {
        title: "By channel",
        subtitle:
          "Offline, in-kind and recurring — pending, completed and rejected",
        columns: [
          "Channel",
          "Pending",
          "Completed",
          "Rejected",
          "Pending amount",
          "Completed amount",
          "Rejected amount",
        ],
        items: channelBreakdownItems,
      },
      payfast_outcome: {
        title: "PayFast checkout outcome",
        subtitle: `${bounds.label.split(" ")[0]} · share of checkouts started`,
        items: [
          {
            id: "completed",
            label: "Completed",
            count: pfCompleted,
            share_pct: Math.round((pfCompleted / started) * 100),
            bar_pct: Math.round((pfCompleted / started) * 100),
            tone: "green",
          },
          {
            id: "pending",
            label: "Still pending",
            count: pfPending,
            share_pct: Math.round((pfPending / started) * 100),
            bar_pct: Math.round((pfPending / started) * 100),
            tone: "amber",
          },
          {
            id: "failed",
            label: "Failed",
            count: pfFailed,
            share_pct: Math.round((pfFailed / started) * 100),
            bar_pct: Math.round((pfFailed / started) * 100),
            tone: "red",
          },
          {
            id: "cancelled",
            label: "Cancelled by donor",
            count: pfCancelled,
            share_pct: Math.round((pfCancelled / started) * 100),
            bar_pct: Math.round((pfCancelled / started) * 100),
            tone: "slate",
          },
        ],
        footnote:
          "Pending > 2 hours = payment likely abandoned → send to call center for follow-up.",
      },
      meta: {
        generated_at: new Date().toISOString(),
        disclaimer: "Live queue totals from donations, box collections, and recurring.",
      },
    };
  }
}
