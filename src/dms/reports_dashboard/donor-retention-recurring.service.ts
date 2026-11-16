import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  formatCount,
  formatPkrCompact,
  monthBounds,
  toNumber,
} from "./report-format.util";

export interface DonorRetentionRecurringQuery {
  period?: string;
}

const COMPLETED_DON = `('completed', 'success', 'paid', 'verified')`;
const COMPLETED_INST = `('completed', 'paid', 'success')`;

@Injectable()
export class DonorRetentionRecurringService {
  private readonly logger = new Logger(DonorRetentionRecurringService.name);

  constructor(private readonly dataSource: DataSource) {}

  private async q(sql: string, params: any[] = []): Promise<any[]> {
    try {
      return await this.dataSource.query(sql, params);
    } catch (err: any) {
      this.logger.warn(
        `Donor retention query failed: ${err?.message || err}`,
      );
      return [];
    }
  }

  private methodBucketSql(alias = "donation_method") {
    return `
      CASE
        WHEN LOWER(COALESCE(${alias}, '')) IN ('stripe', 'payfast', 'card', 'online', 'credit_card')
          OR COALESCE(stripe_subscription_id, '') <> ''
          THEN 'PayFast (card)'
        WHEN LOWER(COALESCE(${alias}, '')) IN ('bank_transfer', 'bank', 'transfer', 'ibft', 'cheque', 'check')
          THEN 'Bank transfer'
        WHEN LOWER(COALESCE(${alias}, '')) IN ('cash', 'manual', 'offline', 'in_kind')
          THEN 'Manual / cash'
        ELSE 'Other'
      END
    `;
  }

  async getOverview(query: DonorRetentionRecurringQuery = {}) {
    const bounds = monthBounds(query.period);
    const monthName = bounds.label.split(" ")[0];
    const periodYm =
      query.period ||
      `${bounds.year}-${String(bounds.monthIndex + 1).padStart(2, "0")}`;

    const now = new Date();
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const yearAgoStr = yearAgo.toISOString().slice(0, 10);
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10);

    // ── Recurring plan health ─────────────────────────────────────────
    const planStats = await this.q(`
      WITH subs AS (
        SELECT
          rd.id,
          COALESCE(rd.amount, 0)::numeric AS amount,
          rd.created_at,
          rd.donation_method,
          rd.stripe_subscription_id,
          LOWER(COALESCE(rd.status, '')) AS status
        FROM recurring_donations rd
        WHERE COALESCE(rd.is_archived, false) = false
          AND rd.parent_id IS NULL
          AND COALESCE(rd.record_type, 'subscription') = 'subscription'
          AND LOWER(COALESCE(rd.status, '')) NOT IN ('cancelled', 'canceled')
      ),
      paid AS (
        SELECT
          i.parent_id,
          COUNT(*)::int AS paid_cnt,
          COALESCE(SUM(COALESCE(i.amount, 0)), 0) AS paid_sum
        FROM recurring_donations i
        WHERE COALESCE(i.is_archived, false) = false
          AND i.parent_id IS NOT NULL
          AND LOWER(COALESCE(i.status, '')) IN ${COMPLETED_INST}
        GROUP BY i.parent_id
      )
      SELECT
        COUNT(*)::int AS registered,
        COUNT(*) FILTER (WHERE p.paid_cnt > 0)::int AS paying,
        COUNT(*) FILTER (WHERE p.paid_cnt IS NULL OR p.paid_cnt = 0)::int AS never_paid,
        COALESCE(SUM(s.amount), 0) AS committed,
        COALESCE(SUM(s.amount) FILTER (WHERE p.paid_cnt > 0), 0) AS paying_committed,
        COALESCE(AVG(s.amount) FILTER (WHERE p.paid_cnt > 0), 0) AS avg_paying_amount,
        COALESCE(SUM(s.amount) FILTER (WHERE p.paid_cnt IS NULL OR p.paid_cnt = 0), 0) AS awaiting_first
      FROM subs s
      LEFT JOIN paid p ON p.parent_id = s.id
    `);

    const registered = toNumber(planStats[0]?.registered);
    const paying = toNumber(planStats[0]?.paying);
    const neverPaid = toNumber(planStats[0]?.never_paid);
    const committed = toNumber(planStats[0]?.committed);
    const avgPaying = toNumber(planStats[0]?.avg_paying_amount);
    const awaitingFirst = toNumber(planStats[0]?.awaiting_first);
    const realRunRate = paying * avgPaying;
    const payingPct = registered > 0 ? (paying / registered) * 100 : 0;
    const neverPct = registered > 0 ? (neverPaid / registered) * 100 : 0;

    const collectedPeriod = await this.q(
      `
      SELECT COALESCE(SUM(COALESCE(amount, 0)), 0) AS total
      FROM recurring_donations
      WHERE COALESCE(is_archived, false) = false
        AND parent_id IS NOT NULL
        AND LOWER(COALESCE(status, '')) IN ${COMPLETED_INST}
        AND COALESCE(DATE(paid_at), DATE(created_at)) >= $1::date
        AND COALESCE(DATE(paid_at), DATE(created_at)) <= $2::date
      `,
      [bounds.start, bounds.end],
    );
    const collectedInPeriod = toNumber(collectedPeriod[0]?.total);

    const collectedMonth = await this.q(
      `
      SELECT COALESCE(SUM(COALESCE(amount, 0)), 0) AS total
      FROM recurring_donations
      WHERE COALESCE(is_archived, false) = false
        AND parent_id IS NOT NULL
        AND LOWER(COALESCE(status, '')) IN ${COMPLETED_INST}
        AND COALESCE(DATE(paid_at), DATE(created_at)) >= $1::date
        AND COALESCE(DATE(paid_at), DATE(created_at)) <= $2::date
      `,
      [thisMonthStart, today],
    );
    const collectedThisMonth = toNumber(collectedMonth[0]?.total);

    // Installment funnel: plans with at least N completed installments
    const funnelRows = await this.q(`
      WITH paid AS (
        SELECT parent_id, COUNT(*)::int AS paid_cnt
        FROM recurring_donations
        WHERE COALESCE(is_archived, false) = false
          AND parent_id IS NOT NULL
          AND LOWER(COALESCE(status, '')) IN ${COMPLETED_INST}
        GROUP BY parent_id
      ),
      subs AS (
        SELECT id FROM recurring_donations
        WHERE COALESCE(is_archived, false) = false
          AND parent_id IS NULL
          AND COALESCE(record_type, 'subscription') = 'subscription'
          AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
      )
      SELECT
        (SELECT COUNT(*)::int FROM subs) AS registered,
        COUNT(*) FILTER (WHERE COALESCE(p.paid_cnt, 0) >= 1)::int AS n1,
        COUNT(*) FILTER (WHERE COALESCE(p.paid_cnt, 0) >= 2)::int AS n2,
        COUNT(*) FILTER (WHERE COALESCE(p.paid_cnt, 0) >= 3)::int AS n3,
        COUNT(*) FILTER (WHERE COALESCE(p.paid_cnt, 0) >= 6)::int AS n6
      FROM subs s
      LEFT JOIN paid p ON p.parent_id = s.id
    `);
    const f = funnelRows[0] || {};
    const funnelCounts = {
      registered: toNumber(f.registered),
      first: toNumber(f.n1),
      second: toNumber(f.n2),
      third: toNumber(f.n3),
      sixth: toNumber(f.n6),
    };
    const dropPct = (from: number, to: number) =>
      from > 0 ? Math.round(((from - to) / from) * 100) : 0;

    // Never-paid by age
    const neverAge = await this.q(`
      WITH never_paid AS (
        SELECT
          s.id,
          COALESCE(s.amount, 0)::numeric AS amount,
          CURRENT_DATE - DATE(s.created_at) AS age_days
        FROM recurring_donations s
        WHERE COALESCE(s.is_archived, false) = false
          AND s.parent_id IS NULL
          AND COALESCE(s.record_type, 'subscription') = 'subscription'
          AND LOWER(COALESCE(s.status, '')) NOT IN ('cancelled', 'canceled')
          AND NOT EXISTS (
            SELECT 1 FROM recurring_donations i
            WHERE i.parent_id = s.id
              AND COALESCE(i.is_archived, false) = false
              AND LOWER(COALESCE(i.status, '')) IN ${COMPLETED_INST}
          )
      )
      SELECT
        COUNT(*) FILTER (WHERE age_days BETWEEN 0 AND 7)::int AS d0_7_cnt,
        COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 0 AND 7), 0) AS d0_7_amt,
        COUNT(*) FILTER (WHERE age_days BETWEEN 8 AND 30)::int AS d8_30_cnt,
        COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 8 AND 30), 0) AS d8_30_amt,
        COUNT(*) FILTER (WHERE age_days BETWEEN 31 AND 90)::int AS d31_90_cnt,
        COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 31 AND 90), 0) AS d31_90_amt,
        COUNT(*) FILTER (WHERE age_days > 90)::int AS d90_cnt,
        COALESCE(SUM(amount) FILTER (WHERE age_days > 90), 0) AS d90_amt
      FROM never_paid
    `);
    const na = neverAge[0] || {};

    // Activation by payment method
    const byMethod = await this.q(`
      WITH subs AS (
        SELECT
          rd.id,
          ${this.methodBucketSql("rd.donation_method")} AS method_bucket
        FROM recurring_donations rd
        WHERE COALESCE(rd.is_archived, false) = false
          AND rd.parent_id IS NULL
          AND COALESCE(rd.record_type, 'subscription') = 'subscription'
          AND LOWER(COALESCE(rd.status, '')) NOT IN ('cancelled', 'canceled')
      ),
      paid AS (
        SELECT DISTINCT parent_id
        FROM recurring_donations
        WHERE COALESCE(is_archived, false) = false
          AND parent_id IS NOT NULL
          AND LOWER(COALESCE(status, '')) IN ${COMPLETED_INST}
      )
      SELECT
        s.method_bucket AS method,
        COUNT(*)::int AS registered,
        COUNT(*) FILTER (WHERE p.parent_id IS NOT NULL)::int AS paying
      FROM subs s
      LEFT JOIN paid p ON p.parent_id = s.id
      GROUP BY s.method_bucket
      ORDER BY registered DESC
    `);

    // Weekly sign-ups vs activated (last 8 ISO weeks)
    const weekly = await this.q(`
      WITH weeks AS (
        SELECT
          gs AS week_start,
          gs + 6 AS week_end,
          ROW_NUMBER() OVER (ORDER BY gs) AS week_num
        FROM generate_series(
          DATE_TRUNC('week', CURRENT_DATE)::date - INTERVAL '7 weeks',
          DATE_TRUNC('week', CURRENT_DATE)::date,
          INTERVAL '1 week'
        ) AS gs
      ),
      signed AS (
        SELECT
          DATE_TRUNC('week', created_at)::date AS week_start,
          id
        FROM recurring_donations
        WHERE COALESCE(is_archived, false) = false
          AND parent_id IS NULL
          AND COALESCE(record_type, 'subscription') = 'subscription'
          AND created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 weeks'
      ),
      activated AS (
        SELECT DISTINCT s.id, DATE_TRUNC('week', s.created_at)::date AS week_start
        FROM recurring_donations s
        INNER JOIN recurring_donations i ON i.parent_id = s.id
        WHERE COALESCE(s.is_archived, false) = false
          AND s.parent_id IS NULL
          AND COALESCE(i.is_archived, false) = false
          AND LOWER(COALESCE(i.status, '')) IN ${COMPLETED_INST}
          AND s.created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 weeks'
      )
      SELECT
        w.week_num,
        COALESCE(COUNT(DISTINCT s.id), 0)::int AS signed_up,
        COALESCE(COUNT(DISTINCT a.id), 0)::int AS paid_first
      FROM weeks w
      LEFT JOIN signed s ON s.week_start = w.week_start
      LEFT JOIN activated a ON a.week_start = w.week_start AND a.id = s.id
      GROUP BY w.week_num
      ORDER BY w.week_num
    `);

    // ── Donor retention KPIs (donations table) ────────────────────────
    const retention = await this.q(
      `
      WITH donor_gifts AS (
        SELECT
          donor_id,
          DATE(date) AS gift_date,
          COALESCE(paid_amount, amount, 0)::numeric AS amt
        FROM donations
        WHERE COALESCE(is_archived, false) = false
          AND donor_id IS NOT NULL
          AND LOWER(COALESCE(status, '')) IN ${COMPLETED_DON}
          AND date IS NOT NULL
      ),
      donors_last_12 AS (
        SELECT DISTINCT donor_id FROM donor_gifts
        WHERE gift_date >= $1::date AND gift_date <= CURRENT_DATE
      ),
      donors_prev_12 AS (
        SELECT DISTINCT donor_id FROM donor_gifts
        WHERE gift_date >= $2::date AND gift_date < $1::date
      ),
      retained AS (
        SELECT COUNT(*)::int AS cnt
        FROM donors_prev_12 p
        INNER JOIN donors_last_12 l ON l.donor_id = p.donor_id
      ),
      lapsed_ly AS (
        SELECT
          COUNT(*)::int AS cnt,
          COALESCE(SUM(g.amt), 0) AS total
        FROM donors_prev_12 p
        LEFT JOIN donors_last_12 l ON l.donor_id = p.donor_id
        LEFT JOIN donor_gifts g
          ON g.donor_id = p.donor_id
          AND g.gift_date >= $2::date AND g.gift_date < $1::date
        WHERE l.donor_id IS NULL
      ),
      first_gift AS (
        SELECT donor_id, MIN(gift_date) AS first_date
        FROM donor_gifts
        GROUP BY donor_id
      ),
      new_month AS (
        SELECT
          COUNT(*)::int AS cnt,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM donations d
              WHERE d.donor_id = f.donor_id
                AND DATE(d.date) = f.first_date
                AND LOWER(COALESCE(d.donation_source, d.donation_method, '')) 
                  IN ('website', 'online', 'payfast', 'stripe', 'card')
            )
          )::int AS online_cnt
        FROM first_gift f
        WHERE f.first_date >= $3::date AND f.first_date <= $4::date
      ),
      last_gift AS (
        SELECT donor_id, MAX(gift_date) AS last_date
        FROM donor_gifts
        GROUP BY donor_id
      ),
      reactivated AS (
        SELECT COUNT(DISTINCT g.donor_id)::int AS cnt
        FROM donor_gifts g
        INNER JOIN last_gift lg ON lg.donor_id = g.donor_id
        WHERE g.gift_date >= $3::date AND g.gift_date <= $4::date
          AND EXISTS (
            SELECT 1 FROM donor_gifts older
            WHERE older.donor_id = g.donor_id
              AND older.gift_date < g.gift_date - INTERVAL '12 months'
          )
          AND NOT EXISTS (
            SELECT 1 FROM donor_gifts mid
            WHERE mid.donor_id = g.donor_id
              AND mid.gift_date < $3::date
              AND mid.gift_date >= $3::date - INTERVAL '12 months'
          )
      ),
      ltv AS (
        SELECT COALESCE(AVG(lifetime), 0) AS avg_ltv
        FROM (
          SELECT donor_id, SUM(amt) AS lifetime
          FROM donor_gifts
          GROUP BY donor_id
        ) t
      )
      SELECT
        (SELECT COUNT(*)::int FROM donors_prev_12) AS prev_pool,
        (SELECT cnt FROM retained) AS retained_cnt,
        (SELECT cnt FROM lapsed_ly) AS lapsed_cnt,
        (SELECT total FROM lapsed_ly) AS lapsed_amt,
        (SELECT cnt FROM new_month) AS new_cnt,
        (SELECT online_cnt FROM new_month) AS new_online,
        (SELECT cnt FROM reactivated) AS reactivated_cnt,
        (SELECT avg_ltv FROM ltv) AS avg_ltv
      `,
      [yearAgoStr, twoYearsAgoStr, thisMonthStart, today],
    );
    const r = retention[0] || {};
    const prevPool = toNumber(r.prev_pool);
    const retainedCnt = toNumber(r.retained_cnt);
    const retentionPct =
      prevPool > 0 ? Math.round((retainedCnt / prevPool) * 100) : 0;
    const newCnt = toNumber(r.new_cnt);
    const newOnline = toNumber(r.new_online);
    const newOnlinePct = newCnt > 0 ? Math.round((newOnline / newCnt) * 100) : 0;

    // RFM segments
    const rfm = await this.q(`
      WITH donor_gifts AS (
        SELECT
          donor_id,
          DATE(date) AS gift_date,
          COALESCE(paid_amount, amount, 0)::numeric AS amt
        FROM donations
        WHERE COALESCE(is_archived, false) = false
          AND donor_id IS NOT NULL
          AND LOWER(COALESCE(status, '')) IN ${COMPLETED_DON}
          AND date IS NOT NULL
      ),
      stats AS (
        SELECT
          donor_id,
          COUNT(*)::int AS freq,
          SUM(amt) AS total_amt,
          MAX(gift_date) AS last_gift,
          MIN(gift_date) AS first_gift,
          CURRENT_DATE - MAX(gift_date) AS days_since
        FROM donor_gifts
        GROUP BY donor_id
      ),
      thresholds AS (
        SELECT COALESCE(AVG(total_amt) * 1.5, 0) AS high_amt
        FROM stats
      ),
      tagged AS (
        SELECT
          s.*,
          CASE
            WHEN s.days_since <= 90 AND s.freq >= 4 AND s.total_amt >= t.high_amt THEN 'champions'
            WHEN s.days_since <= 90 AND s.freq >= 3 THEN 'loyal'
            WHEN s.first_gift >= CURRENT_DATE - INTERVAL '90 days' THEN 'new_quarter'
            WHEN s.days_since BETWEEN 181 AND 365 AND s.freq >= 2 THEN 'at_risk'
            WHEN s.days_since > 365 THEN 'lapsed'
            WHEN s.freq = 1 AND s.days_since > 90 THEN 'one_time'
            ELSE 'other'
          END AS segment
        FROM stats s
        CROSS JOIN thresholds t
      )
      SELECT
        segment,
        COUNT(*)::int AS cnt,
        COALESCE(SUM(total_amt), 0) AS total_amt
      FROM tagged
      WHERE segment <> 'other'
      GROUP BY segment
    `);
    const rfmMap = Object.fromEntries(
      rfm.map((row) => [row.segment, row]),
    );

    // Cohort retention: first gift month → % who gave again in M+n
    const cohort = await this.q(`
      WITH donor_gifts AS (
        SELECT donor_id, DATE_TRUNC('month', date)::date AS gift_month
        FROM donations
        WHERE COALESCE(is_archived, false) = false
          AND donor_id IS NOT NULL
          AND LOWER(COALESCE(status, '')) IN ${COMPLETED_DON}
          AND date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
          AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      ),
      firsts AS (
        SELECT donor_id, MIN(gift_month) AS first_month
        FROM (
          SELECT donor_id, DATE_TRUNC('month', date)::date AS gift_month
          FROM donations
          WHERE COALESCE(is_archived, false) = false
            AND donor_id IS NOT NULL
            AND LOWER(COALESCE(status, '')) IN ${COMPLETED_DON}
            AND date IS NOT NULL
        ) x
        GROUP BY donor_id
        HAVING MIN(gift_month) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
          AND MIN(gift_month) < DATE_TRUNC('month', CURRENT_DATE)
      ),
      months AS (
        SELECT DISTINCT first_month FROM firsts ORDER BY first_month
      )
      SELECT
        TO_CHAR(f.first_month, 'Mon YYYY') AS cohort_label,
        f.first_month,
        COUNT(DISTINCT f.donor_id)::int AS cohort_size,
        COUNT(DISTINCT f.donor_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM donor_gifts g
            WHERE g.donor_id = f.donor_id
              AND g.gift_month = f.first_month + INTERVAL '1 month'
          )
        )::int AS m1,
        COUNT(DISTINCT f.donor_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM donor_gifts g
            WHERE g.donor_id = f.donor_id
              AND g.gift_month = f.first_month + INTERVAL '2 months'
          )
        )::int AS m2,
        COUNT(DISTINCT f.donor_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM donor_gifts g
            WHERE g.donor_id = f.donor_id
              AND g.gift_month = f.first_month + INTERVAL '3 months'
          )
        )::int AS m3,
        COUNT(DISTINCT f.donor_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM donor_gifts g
            WHERE g.donor_id = f.donor_id
              AND g.gift_month = f.first_month + INTERVAL '4 months'
          )
        )::int AS m4,
        COUNT(DISTINCT f.donor_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM donor_gifts g
            WHERE g.donor_id = f.donor_id
              AND g.gift_month = f.first_month + INTERVAL '5 months'
          )
        )::int AS m5,
        COUNT(DISTINCT f.donor_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM donor_gifts g
            WHERE g.donor_id = f.donor_id
              AND g.gift_month = f.first_month + INTERVAL '6 months'
          )
        )::int AS m6
      FROM firsts f
      GROUP BY f.first_month
      ORDER BY f.first_month
    `);

    const pctOf = (n: number, d: number) =>
      d > 0 ? Math.round((n / d) * 100) : null;

    const segmentMeta: Record<
      string,
      { title: string; criteria: string; action: string; tone: string }
    > = {
      champions: {
        title: "Champions",
        criteria: "Gave in last 90 days, 4+ gifts, high amount",
        action: "Personal call from management",
        tone: "green",
      },
      loyal: {
        title: "Loyal regulars",
        criteria: "3+ gifts, recent",
        action: "Invite to monthly membership",
        tone: "blue",
      },
      new_quarter: {
        title: "New this quarter",
        criteria: "First gift in last 90 days",
        action: "Welcome + impact WhatsApp series",
        tone: "teal",
      },
      at_risk: {
        title: "At risk",
        criteria: "Regular, but no gift in 6–12 months",
        action: "Call center check-in",
        tone: "amber",
      },
      lapsed: {
        title: "Lapsed",
        criteria: "No gift in 12+ months",
        action: "Reactivation campaign",
        tone: "red",
      },
      one_time: {
        title: "One-time",
        criteria: "Single gift, older than 90 days",
        action: "Project update + second ask",
        tone: "slate",
      },
    };

    const neverPaidBuckets = [
      {
        id: "0_7",
        label: "0–7 days",
        count: toNumber(na.d0_7_cnt),
        amount_formatted: formatPkrCompact(toNumber(na.d0_7_amt)),
        action: "Automatic WhatsApp reminder with payment link",
      },
      {
        id: "8_30",
        label: "8–30 days",
        count: toNumber(na.d8_30_cnt),
        amount_formatted: formatPkrCompact(toNumber(na.d8_30_amt)),
        action: "Call center: help complete first payment",
      },
      {
        id: "31_90",
        label: "31–90 days",
        count: toNumber(na.d31_90_cnt),
        amount_formatted: formatPkrCompact(toNumber(na.d31_90_amt)),
        action: "Call + offer bank transfer instead of card",
      },
      {
        id: "90_plus",
        label: "90+ days",
        count: toNumber(na.d90_cnt),
        amount_formatted: formatPkrCompact(toNumber(na.d90_amt)),
        action: "Close plan — stop counting it as committed",
      },
    ];

    const methodItems = byMethod.map((row) => {
      const reg = toNumber(row.registered);
      const pay = toNumber(row.paying);
      return {
        id: String(row.method),
        method: String(row.method),
        paying: pay,
        registered: reg,
        success_pct: reg > 0 ? Math.round((pay / reg) * 100) : 0,
        bar_pct: reg > 0 ? Math.round((pay / reg) * 100) : 0,
      };
    });

    const weeklyItems = weekly.map((row) => {
      const signed = toNumber(row.signed_up);
      const paid = toNumber(row.paid_first);
      return {
        id: `w${row.week_num}`,
        label: `W${row.week_num}`,
        signed_up: signed,
        paid_first: paid,
        conversion_pct: signed > 0 ? Math.round((paid / signed) * 100) : 0,
      };
    });
    const weekMax = Math.max(
      1,
      ...weeklyItems.map((w) => Math.max(w.signed_up, w.paid_first)),
    );

    const committedBar = Math.max(committed, realRunRate, collectedThisMonth, 1);

    return {
      sample_data: false,
      badge: "Live DMS recurring + donations",
      title: "Donor Retention & Recurring",
      subtitle:
        "Who keeps giving, who is slipping away, and recurring plan health",
      filters: {
        period: periodYm,
        period_label: bounds.label,
      },
      retention_cards: {
        retention_12m: {
          title: "12-month retention",
          value: `${retentionPct}%`,
          value_tone: "amber",
          footer: "Donors who gave again within a year",
        },
        lapsed_ly: {
          title: "Gave last year, not this year",
          value: formatCount(toNumber(r.lapsed_cnt)),
          value_tone: "red",
          footer: `${formatPkrCompact(toNumber(r.lapsed_amt))} last year from them`,
        },
        new_donors: {
          title: `New donors (${monthName.slice(0, 3)})`,
          value: formatCount(newCnt),
          value_tone: "green",
          footer: `${newOnlinePct}% came online`,
        },
        reactivated: {
          title: `Reactivated (${monthName.slice(0, 3)})`,
          value: formatCount(toNumber(r.reactivated_cnt)),
          value_tone: "blue",
          footer: "Lapsed 12+ months, gave again",
        },
        avg_ltv: {
          title: "Avg lifetime value",
          value: formatPkrCompact(toNumber(r.avg_ltv)),
          value_tone: "default",
          footer: "Per de-duplicated donor",
        },
      },
      rfm_segments: {
        title: "Donor segments (RFM)",
        subtitle:
          "Recency · frequency · amount — each segment gets its own follow-up channel",
        items: Object.keys(segmentMeta).map((key) => {
          const meta = segmentMeta[key];
          const row = rfmMap[key];
          return {
            id: key,
            title: meta.title,
            criteria: meta.criteria,
            count: formatCount(toNumber(row?.cnt)),
            amount_formatted: formatPkrCompact(toNumber(row?.total_amt)),
            action: meta.action,
            tone: meta.tone,
          };
        }),
      },
      plan_health: {
        title: "Recurring plan health",
        subtitle: `Subscriptions & installments · ${bounds.label}`,
        cards: {
          registered_plans: {
            title: "Registered plans",
            value: formatCount(registered),
            footer: "Open subscriptions",
          },
          paying_plans: {
            title: "Paying plans",
            value: formatCount(paying),
            footer: `${payingPct.toFixed(1)}% paid at least once`,
            value_tone: "green",
          },
          never_paid: {
            title: "Never paid",
            value: formatCount(neverPaid),
            footer: `${neverPct.toFixed(1)}% — no installment yet`,
            value_tone: "red",
          },
          committed_monthly: {
            title: "Committed monthly",
            value: formatPkrCompact(committed),
            footer: `All ${formatCount(registered)} plans`,
          },
          collected_in_period: {
            title: `Collected in ${monthName}`,
            value: formatPkrCompact(collectedInPeriod),
            footer: "Completed installments",
            value_tone: "green",
          },
          collected_this_month: {
            title: "This month so far",
            value: formatPkrCompact(collectedThisMonth),
            footer: `${thisMonthStart.slice(8)}–${today.slice(8)} ${monthName}`,
            value_tone: "blue",
          },
          awaiting_first: {
            title: "Awaiting 1st installment",
            value: formatPkrCompact(awaitingFirst),
            footer: "Value of never-paid plans",
            value_tone: "amber",
          },
        },
        promised_vs_actual: {
          title: "Promised vs actually coming in",
          items: [
            {
              id: "committed",
              label: `Committed monthly (all ${formatCount(registered)} plans)`,
              amount_formatted: formatPkrCompact(committed),
              bar_pct: Math.round((committed / committedBar) * 100),
              tone: "blue",
            },
            {
              id: "run_rate",
              label: "Real run-rate (est.)",
              amount_formatted: formatPkrCompact(realRunRate),
              bar_pct: Math.round((realRunRate / committedBar) * 100),
              tone: "indigo",
              footnote: `${formatCount(paying)} paying × avg ${formatPkrCompact(avgPaying)}`,
            },
            {
              id: "collected_month",
              label: "Collected this month",
              amount_formatted: formatPkrCompact(collectedThisMonth),
              bar_pct: Math.round((collectedThisMonth / committedBar) * 100),
              tone: "green",
            },
          ],
        },
        installment_funnel: {
          title: "Installment funnel",
          items: [
            {
              id: "registered",
              label: "Registered",
              count: funnelCounts.registered,
              drop_pct: null,
            },
            {
              id: "1st",
              label: "1st installment",
              count: funnelCounts.first,
              drop_pct: dropPct(funnelCounts.registered, funnelCounts.first),
            },
            {
              id: "2nd",
              label: "2nd installment",
              count: funnelCounts.second,
              drop_pct: dropPct(funnelCounts.first, funnelCounts.second),
            },
            {
              id: "3rd",
              label: "3rd installment",
              count: funnelCounts.third,
              drop_pct: dropPct(funnelCounts.second, funnelCounts.third),
            },
            {
              id: "6th",
              label: "6th installment",
              count: funnelCounts.sixth,
              drop_pct: dropPct(funnelCounts.third, funnelCounts.sixth),
            },
          ],
        },
        never_paid_by_age: {
          title: "Never-paid plans, by age",
          items: neverPaidBuckets,
        },
        activation_by_method: {
          title: "Activation by payment method",
          subtitle:
            "If card activation stays lowest, the problem is checkout — not donor intent.",
          items: methodItems,
        },
      },
      weekly_activation: {
        title: "Weekly sign-ups vs activated",
        subtitle: "Signed up vs paid 1st installment · last 8 weeks",
        max: weekMax,
        items: weeklyItems,
        insights: [
          `Headline committed (${formatPkrCompact(committed)}) overstates income vs paying run-rate (${formatPkrCompact(realRunRate)}).`,
          `${neverPct.toFixed(0)}% of plans never paid once — fixing first payment beats chasing new sign-ups.`,
          "Plans unpaid 90+ days should be closed so dashboards stop counting them as committed.",
          "Track 2nd-installment retention monthly — that is where paying becomes habit.",
        ],
      },
      cohort_retention: {
        title: "Cohort retention",
        subtitle:
          "% of donors from each first-gift month who gave again in later months",
        columns: ["M+1", "M+2", "M+3", "M+4", "M+5", "M+6"],
        rows: cohort.map((row) => {
          const size = toNumber(row.cohort_size);
          const cells = [row.m1, row.m2, row.m3, row.m4, row.m5, row.m6].map(
            (n) => pctOf(toNumber(n), size),
          );
          return {
            id: String(row.first_month),
            label: String(row.cohort_label),
            size,
            cells,
          };
        }),
      },
      meta: {
        generated_at: new Date().toISOString(),
        period_start: bounds.start,
        period_end: bounds.end,
        disclaimer:
          "Retention from completed donations; plan health from recurring_donations ledger.",
      },
    };
  }
}
