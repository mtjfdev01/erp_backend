import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  COMPLETED_DONATION_STATUSES,
  FAILED_DONATION_STATUSES,
  PENDING_DONATION_STATUSES,
  formatCount,
  formatPkrCompact,
  monthBounds,
  pctChange,
  ptsChange,
  toNumber,
} from "./report-format.util";

export interface ManagementOverviewQuery {
  period?: string;
  project?: string;
  office?: string;
}

@Injectable()
export class ManagementOverviewService {
  constructor(private readonly dataSource: DataSource) {}

  private async q(sql: string, params: any[] = []): Promise<any[]> {
    try {
      return await this.dataSource.query(sql, params);
    } catch {
      return [];
    }
  }

  async getOverview(query: ManagementOverviewQuery = {}) {
    const bounds = monthBounds(query.period);
    const completedIn = COMPLETED_DONATION_STATUSES.map((s) => `'${s}'`).join(
      ",",
    );
    const pendingIn = PENDING_DONATION_STATUSES.map((s) => `'${s}'`).join(",");
    const failedIn = FAILED_DONATION_STATUSES.map((s) => `'${s}'`).join(",");

    // Raised completed — selected month vs previous
    const raisedSql = `
      SELECT COALESCE(SUM(COALESCE(d.paid_amount, d.amount, 0)), 0) AS total
      FROM donations d
      WHERE d.is_archived = false
        AND LOWER(COALESCE(d.status, '')) IN (${completedIn})
        AND d.date >= $1::date AND d.date <= $2::date
    `;
    const raised = toNumber((await this.q(raisedSql, [bounds.start, bounds.end]))[0]?.total);
    const raisedPrev = toNumber(
      (await this.q(raisedSql, [bounds.prevStart, bounds.prevEnd]))[0]?.total,
    );
    const raisedDelta = pctChange(raised, raisedPrev);

    // Pending verification queue (current)
    const pendingLive = await this.q(`
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(COALESCE(d.paid_amount, d.amount, 0)), 0) AS total,
        COUNT(*) FILTER (WHERE d.created_at < NOW() - INTERVAL '7 days')::int AS older_7
      FROM donations d
      WHERE d.is_archived = false
        AND LOWER(COALESCE(d.status, '')) IN (${pendingIn})
    `);
    const boxPending = await this.q(`
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(COALESCE(collection_amount, 0)), 0) AS total,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS older_7
      FROM donation_box_donations
      WHERE is_archived = false
        AND LOWER(COALESCE(status, '')) = 'pending'
    `);
    const pendingCountAll =
      toNumber(pendingLive[0]?.cnt) + toNumber(boxPending[0]?.cnt);
    const pendingAmountAll =
      toNumber(pendingLive[0]?.total) + toNumber(boxPending[0]?.total);
    const pendingOlder7 =
      toNumber(pendingLive[0]?.older_7) + toNumber(boxPending[0]?.older_7);

    // Failed online rate for selected month
    const failedSql = `
      SELECT
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(d.status, '')) IN (${failedIn})
        )::int AS failed_cnt,
        COALESCE(SUM(
          CASE WHEN LOWER(COALESCE(d.status, '')) IN (${failedIn})
            THEN COALESCE(d.paid_amount, d.amount, 0) ELSE 0 END
        ), 0) AS failed_amt,
        COUNT(*)::int AS started_cnt
      FROM donations d
      WHERE d.is_archived = false
        AND LOWER(COALESCE(d.donation_source, '')) = 'website'
        AND d.date >= $1::date AND d.date <= $2::date
    `;
    const failedRows = await this.q(failedSql, [bounds.start, bounds.end]);
    const failedCnt = toNumber(failedRows[0]?.failed_cnt);
    const failedAmt = toNumber(failedRows[0]?.failed_amt);
    const startedCnt = toNumber(failedRows[0]?.started_cnt);
    const failRate = startedCnt > 0 ? (failedCnt / startedCnt) * 100 : 0;

    const failedPrevRows = await this.q(failedSql, [
      bounds.prevStart,
      bounds.prevEnd,
    ]);
    const failedPrevCnt = toNumber(failedPrevRows[0]?.failed_cnt);
    const startedPrevCnt = toNumber(failedPrevRows[0]?.started_cnt);
    const failRatePrev =
      startedPrevCnt > 0 ? (failedPrevCnt / startedPrevCnt) * 100 : 0;
    const failDelta = ptsChange(failRate, failRatePrev);

    // Registered donors
    const donorRows = await this.q(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(source, '')) IN ('website', 'online', 'payfast', 'stripe')
        )::int AS online_cnt,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(source, '')) NOT IN ('website', 'online', 'payfast', 'stripe')
             OR source IS NULL
        )::int AS offline_cnt
      FROM donors
      WHERE COALESCE(is_archived, false) = false
    `);
    const donorsTotal = toNumber(donorRows[0]?.total);
    const donorsOnline = toNumber(donorRows[0]?.online_cnt);
    const donorsOffline = toNumber(donorRows[0]?.offline_cnt);

    // Recurring run-rate (parent/subscription rows)
    let recurring = (
      await this.q(`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'active')::int AS active_plans,
          COUNT(*)::int AS all_plans,
          COALESCE(SUM(
            CASE WHEN LOWER(COALESCE(status, '')) = 'active'
              THEN COALESCE(amount, paid_amount, 0) ELSE 0 END
          ), 0) AS active_amount,
          COALESCE(SUM(COALESCE(amount, paid_amount, 0)), 0) AS committed_amount,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) = 'active'
              AND COALESCE(paid_amount, 0) > 0
          )::int AS paying_plans
        FROM recurring_donations
        WHERE is_archived = false
          AND parent_id IS NULL
      `)
    )[0];
    if (!recurring || toNumber(recurring.all_plans) === 0) {
      recurring = (
        await this.q(`
          SELECT
            COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'active')::int AS active_plans,
            COUNT(*)::int AS all_plans,
            COALESCE(SUM(
              CASE WHEN LOWER(COALESCE(status, '')) = 'active'
                THEN COALESCE(amount, paid_amount, 0) ELSE 0 END
            ), 0) AS active_amount,
            COALESCE(SUM(COALESCE(amount, paid_amount, 0)), 0) AS committed_amount,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(status, '')) = 'active'
                AND COALESCE(paid_amount, 0) > 0
            )::int AS paying_plans
          FROM recurring_donations
          WHERE is_archived = false
        `)
      )[0];
    }
    const runRate = toNumber(recurring?.active_amount);
    const committed = toNumber(recurring?.committed_amount);
    const paying = toNumber(recurring?.paying_plans);
    const plans =
      toNumber(recurring?.active_plans) || toNumber(recurring?.all_plans);

    // Monthly trend — last 12 months ending selected period
    const trendStart = new Date(bounds.year, bounds.monthIndex - 11, 1)
      .toISOString()
      .slice(0, 10);
    const trendRows = await this.q(
      `
      SELECT
        to_char(date_trunc('month', d.date), 'YYYY-MM') AS ym,
        COALESCE(SUM(
          CASE WHEN LOWER(COALESCE(d.status, '')) IN (${completedIn})
            THEN COALESCE(d.paid_amount, d.amount, 0) ELSE 0 END
        ), 0) AS completed_amt,
        COALESCE(SUM(
          CASE WHEN LOWER(COALESCE(d.status, '')) IN (${pendingIn})
            THEN COALESCE(d.paid_amount, d.amount, 0) ELSE 0 END
        ), 0) AS pending_amt
      FROM donations d
      WHERE d.is_archived = false
        AND d.date >= $1::date AND d.date <= $2::date
      GROUP BY 1
      ORDER BY 1
      `,
      [trendStart, bounds.end],
    );
    const trendMap = new Map(
      trendRows.map((r) => [
        String(r.ym),
        {
          completed: toNumber(r.completed_amt),
          pending: toNumber(r.pending_amt),
        },
      ]),
    );
    const months: string[] = [];
    const completedSeries: number[] = [];
    const pendingSeries: number[] = [];
    const labels: number[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(bounds.year, bounds.monthIndex - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push(d.toLocaleString("en-US", { month: "short" }));
      const cell = trendMap.get(ym) || { completed: 0, pending: 0 };
      const cM = Math.round(cell.completed / 1_000_000);
      const pM = Math.round(cell.pending / 1_000_000);
      completedSeries.push(cM);
      pendingSeries.push(pM);
      labels.push(cM + pM);
    }

    // Raised by channel
    const channelRows = await this.q(
      `
      SELECT
        CASE
          WHEN d.organization_id IS NOT NULL THEN 'csr'
          WHEN LOWER(COALESCE(d.donation_method, '')) IN ('in_kind', 'inkind', 'in-kind') THEN 'in_kind'
          WHEN LOWER(COALESCE(d.donation_source, '')) = 'website'
            OR LOWER(COALESCE(d.donation_method, '')) IN ('online', 'stripe', 'stripe_embed', 'payfast')
            THEN 'online'
          WHEN LOWER(COALESCE(d.donation_source, '')) LIKE '%recurring%'
            OR LOWER(COALESCE(d.donation_method, '')) LIKE '%recurring%'
            THEN 'recurring'
          ELSE 'offline'
        END AS channel,
        COALESCE(SUM(COALESCE(d.paid_amount, d.amount, 0)), 0) AS total
      FROM donations d
      WHERE d.is_archived = false
        AND LOWER(COALESCE(d.status, '')) IN (${completedIn})
        AND d.date >= $1::date AND d.date <= $2::date
      GROUP BY 1
      `,
      [bounds.start, bounds.end],
    );
    const channelMap: Record<string, number> = {
      online: 0,
      offline: 0,
      csr: 0,
      donation_boxes: 0,
      recurring: 0,
      in_kind: 0,
    };
    for (const row of channelRows) {
      const key = String(row.channel || "offline");
      channelMap[key] = (channelMap[key] || 0) + toNumber(row.total);
    }
    channelMap.donation_boxes = toNumber(
      (
        await this.q(
          `
          SELECT COALESCE(SUM(COALESCE(collection_amount, 0)), 0) AS total
          FROM donation_box_donations
          WHERE is_archived = false
            AND LOWER(COALESCE(status, '')) IN ('verified', 'deposited', 'pending', 'completed')
            AND collection_date >= $1::date AND collection_date <= $2::date
          `,
          [bounds.start, bounds.end],
        )
      )[0]?.total,
    );

    const channelDefs = [
      { id: "online", label: "Online (PayFast)" },
      { id: "offline", label: "Offline (bank / cash)" },
      { id: "csr", label: "CSR" },
      { id: "donation_boxes", label: "Donation boxes" },
      { id: "recurring", label: "Recurring" },
      { id: "in_kind", label: "In-kind (valued)" },
    ];
    const channelTotal =
      Object.values(channelMap).reduce((a, b) => a + b, 0) || 1;
    const channelMax = Math.max(...Object.values(channelMap), 1);
    const raisedByChannel = channelDefs.map((c) => {
      const amount = channelMap[c.id] || 0;
      return {
        id: c.id,
        label: c.label,
        amount_formatted: formatPkrCompact(amount),
        share_pct: Math.round((amount / channelTotal) * 100),
        bar_pct: Math.round((amount / channelMax) * 100),
      };
    });

    // Funds by project
    const projectRows = await this.q(
      `
      SELECT
        CASE
          WHEN NULLIF(TRIM(COALESCE(d.project_name, '')), '') IS NULL
            AND NULLIF(TRIM(COALESCE(d.project_id, '')), '') IS NULL
            THEN 'Unassigned (N/A)'
          ELSE COALESCE(
            NULLIF(TRIM(d.project_name), ''),
            NULLIF(TRIM(d.project_id), ''),
            'Unassigned (N/A)'
          )
        END AS project_label,
        COALESCE(SUM(COALESCE(d.paid_amount, d.amount, 0)), 0) AS total
      FROM donations d
      WHERE d.is_archived = false
        AND LOWER(COALESCE(d.status, '')) IN (${completedIn})
        AND d.date >= $1::date AND d.date <= $2::date
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 12
      `,
      [bounds.start, bounds.end],
    );
    const projectMax = Math.max(
      ...projectRows.map((r) => toNumber(r.total)),
      1,
    );
    const fundsByProject = projectRows.map((r, idx) => {
      const amount = toNumber(r.total);
      const label = String(r.project_label || "Unassigned (N/A)");
      return {
        id: `p${idx}`,
        label,
        amount_formatted: formatPkrCompact(amount).replace(/^PKR\s*/, ""),
        bar_pct: Math.round((amount / projectMax) * 100),
        tone: /unassigned|n\/a/i.test(label) ? "amber" : "blue",
      };
    });

    const asOf = new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return {
      filters: {
        period:
          query.period ||
          `${bounds.year}-${String(bounds.monthIndex + 1).padStart(2, "0")}`,
        period_label: bounds.label,
        project: query.project || "all",
        project_label:
          query.project && query.project !== "all"
            ? query.project
            : "All projects",
        office: query.office || "all",
        office_label:
          query.office && query.office !== "all" ? query.office : "All offices",
      },
      sample_data: false,
      subtitle: `All channels · Completed donations only · ${bounds.label} vs ${bounds.prevLabel} · as of ${asOf}`,
      cards: {
        raised_completed: {
          title: "Raised (completed)",
          value: formatPkrCompact(raised),
          raw_value: raised,
          delta: `${raisedDelta.text} vs ${bounds.prevLabel}`,
          delta_trend: raisedDelta.trend,
          footer: "Excludes pending and failed",
          value_tone: "green",
        },
        pending_verification: {
          title: "Pending verification",
          value: formatPkrCompact(pendingAmountAll),
          raw_value: pendingAmountAll,
          delta: `${formatCount(pendingCountAll)} records`,
          delta_trend: "neutral",
          footer: `${formatCount(pendingOlder7)} older than 7 days`,
          value_tone: "amber",
        },
        failed_online: {
          title: "Failed online payments",
          value: `${failRate.toFixed(1)}%`,
          raw_value: failRate,
          delta: `${failDelta.text} vs ${bounds.prevLabel}`,
          delta_trend: failDelta.trend,
          footer: `${formatPkrCompact(failedAmt)} not recovered`,
          value_tone: "red",
        },
        registered_donors: {
          title: "Registered donors",
          value: formatCount(donorsTotal),
          raw_value: donorsTotal,
          delta: `${formatCount(donorsOnline)} online · ${formatCount(donorsOffline)} offline`,
          delta_trend: "neutral",
          footer: "Before de-duplication",
          value_tone: "default",
        },
        recurring_run_rate: {
          title: "Recurring run-rate (est.)",
          value: formatPkrCompact(runRate),
          raw_value: runRate,
          delta: `${formatCount(paying)} paying of ${formatCount(plans)} plans`,
          delta_trend: "neutral",
          footer: `Committed ${formatPkrCompact(committed)} incl. never-paid`,
          value_tone: "blue",
        },
      },
      monthly_trend: {
        title: "Monthly collection trend",
        subtitle: "PKR millions · completed vs pending verification",
        months,
        completed: completedSeries,
        pending: pendingSeries,
        labels,
      },
      raised_by_channel: {
        title: "Raised by channel",
        subtitle: `Share of completed amount, ${bounds.label.split(" ")[0]}`,
        items: raisedByChannel,
      },
      funds_by_project: {
        title: "Funds by project",
        subtitle: '"Unassigned" = donations saved with Project N/A',
        items: fundsByProject,
      },
      meta: {
        generated_at: new Date().toISOString(),
        disclaimer:
          "Live totals from DMS donations, donors, recurring, and box collections.",
      },
    };
  }
}
