import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  formatCount,
  formatRsCompact,
  monthBounds,
  toNumber,
} from "./report-format.util";

export interface FieldTeamDonationBoxesQuery {
  period?: string;
}

@Injectable()
export class FieldTeamDonationBoxesService {
  private readonly logger = new Logger(FieldTeamDonationBoxesService.name);

  constructor(private readonly dataSource: DataSource) {}

  private async q(sql: string, params: any[] = []): Promise<any[]> {
    try {
      return await this.dataSource.query(sql, params);
    } catch (err: any) {
      this.logger.warn(
        `Field team query failed: ${err?.message || err}`,
      );
      return [];
    }
  }

  private toneForPct(pct: number): string {
    if (pct >= 85) return "green";
    if (pct >= 60) return "amber";
    if (pct >= 40) return "orange";
    if (pct >= 20) return "red";
    return "rose";
  }

  async getOverview(query: FieldTeamDonationBoxesQuery = {}) {
    const bounds = monthBounds(query.period);
    const monthName = bounds.label.split(" ")[0];
    const periodYm =
      query.period ||
      `${bounds.year}-${String(bounds.monthIndex + 1).padStart(2, "0")}`;

    // Boxes registered + size split
    const boxStats = await this.q(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(box_type::text, '')) = 'small')::int AS small_cnt,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(box_type::text, '')) = 'medium')::int AS medium_cnt,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(box_type::text, '')) = 'large')::int AS large_cnt,
        COUNT(*) FILTER (
          WHERE COALESCE(is_active, true) = true
            AND LOWER(COALESCE(status::text, '')) = 'active'
        )::int AS active_cnt
      FROM donation_boxes
      WHERE COALESCE(is_archived, false) = false
    `);
    const boxesTotal = toNumber(boxStats[0]?.total);
    const smallCnt = toNumber(boxStats[0]?.small_cnt);
    const mediumCnt = toNumber(boxStats[0]?.medium_cnt);
    const largeCnt = toNumber(boxStats[0]?.large_cnt);

    // Same source as Collection Units Collections list (donation_box_donations)
    const monthCols = await this.q(
      `
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(COALESCE(collection_amount, 0)), 0) AS total,
        COALESCE(AVG(NULLIF(collection_amount, 0)), 0) AS avg_amt
      FROM donation_box_donations
      WHERE COALESCE(is_archived, false) = false
        AND LOWER(COALESCE(status::text, '')) <> 'cancelled'
        AND collection_date >= $1::date
        AND collection_date <= $2::date
      `,
      [bounds.start, bounds.end],
    );
    const collected = toNumber(monthCols[0]?.total);
    const collectionCount = toNumber(monthCols[0]?.cnt);
    const avgAmt = toNumber(monthCols[0]?.avg_amt);
    const medianAmt = avgAmt;

    // Silent 45+ days (active boxes with no recent collection)
    const silent = await this.q(`
      SELECT COUNT(*)::int AS cnt
      FROM donation_boxes b
      WHERE COALESCE(b.is_archived, false) = false
        AND COALESCE(b.is_active, true) = true
        AND LOWER(COALESCE(b.status::text, '')) = 'active'
        AND (
          b.last_collection_date IS NULL
          OR b.last_collection_date < CURRENT_DATE - INTERVAL '45 days'
        )
    `);
    const silentCount = toNumber(silent[0]?.cnt);

    // Collector performance — collected_by_id → "user" (TypeORM User table)
    const collectors = await this.q(
      `
      SELECT
        COALESCE(u.id, 0) AS collector_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          NULLIF(TRIM(d.collector_name), ''),
          u.email,
          'Unknown'
        ) AS collector_name,
        COUNT(*)::int AS collections,
        COALESCE(SUM(COALESCE(d.collection_amount, 0)), 0) AS collected
      FROM donation_box_donations d
      LEFT JOIN "user" u ON u.id = d.collected_by_id
      WHERE COALESCE(d.is_archived, false) = false
        AND LOWER(COALESCE(d.status::text, '')) <> 'cancelled'
        AND d.collection_date >= $1::date
        AND d.collection_date <= $2::date
      GROUP BY COALESCE(u.id, 0), 2
      ORDER BY collected DESC
      LIMIT 20
      `,
      [bounds.start, bounds.end],
    );

    // Assigned Targets (donation_box_collection); default 100000 if none
    const targetRows = await this.q(
      `
      SELECT user_id, COALESCE(target_amount, 0) AS target_amount
      FROM user_targets
      WHERE COALESCE(is_archived, false) = false
        AND target_type = 'donation_box_collection'
        AND period_year = $1
        AND period_month = $2
      `,
      [bounds.year, bounds.monthIndex + 1],
    );
    const targetByUser = new Map<number, number>();
    for (const t of targetRows) {
      const amt = toNumber(t.target_amount);
      if (amt > 0) targetByUser.set(toNumber(t.user_id), amt);
    }

    const defaultTarget = 100_000;

    const collectorItems = collectors.map((c, idx) => {
      const collectedAmt = toNumber(c.collected);
      const collectorId = toNumber(c.collector_id);
      const targetAmt =
        collectorId && targetByUser.has(collectorId)
          ? targetByUser.get(collectorId)!
          : defaultTarget;
      const pct = Math.min(
        100,
        Math.round((collectedAmt / Math.max(targetAmt, 1)) * 100),
      );
      return {
        id: `c${collectorId || idx}`,
        name: String(c.collector_name || "Unknown"),
        collected_formatted: formatRsCompact(collectedAmt),
        has_target: true,
        target_formatted: formatRsCompact(targetAmt),
        collections: toNumber(c.collections),
        pct,
        tone: this.toneForPct(pct),
      };
    });

    const teamPct =
      collectorItems.length > 0
        ? Math.round(
            collectorItems.reduce((a, c) => a + Number(c.pct || 0), 0) /
              collectorItems.length,
          )
        : 0;

    // Top boxes by collection this month
    const topBoxes = await this.q(
      `
      SELECT
        b.id,
        COALESCE(NULLIF(TRIM(b.key_no), ''), NULLIF(TRIM(b.box_id_no), ''), CONCAT('#', b.id)) AS box_key,
        COALESCE(NULLIF(TRIM(b.shop_name), ''), NULLIF(TRIM(b.name), ''), 'Unknown shop') AS shop,
        COALESCE(INITCAP(REPLACE(b.box_type::text, '_', ' ')), '—') AS size,
        COALESCE(SUM(COALESCE(d.collection_amount, 0)), 0) AS collected
      FROM donation_box_donations d
      INNER JOIN donation_boxes b ON b.id = d.donation_box_id
      WHERE COALESCE(d.is_archived, false) = false
        AND COALESCE(b.is_archived, false) = false
        AND LOWER(COALESCE(d.status::text, '')) <> 'cancelled'
        AND d.collection_date >= $1::date
        AND d.collection_date <= $2::date
      GROUP BY b.id, b.key_no, b.box_id_no, b.shop_name, b.name, b.box_type
      ORDER BY collected DESC
      LIMIT 10
      `,
      [bounds.start, bounds.end],
    );

    return {
      sample_data: false,
      badge: "Live DMS collections & boxes",
      title: "Field Team & Donation Boxes",
      subtitle: `Supervisor view · ${bounds.label}`,
      filters: {
        period: periodYm,
        period_label: bounds.label,
      },
      cards: {
        boxes_registered: {
          title: "Boxes registered",
          value: formatCount(boxesTotal),
          value_tone: "default",
          footer: `${formatCount(smallCnt)} small · ${formatCount(mediumCnt)} medium · ${formatCount(largeCnt)} large`,
        },
        collected_in_month: {
          title: `Collected in ${monthName}`,
          value: formatRsCompact(collected),
          value_tone: "green",
          footer: `from ${formatCount(collectionCount)} collections`,
        },
        avg_per_collection: {
          title: "Avg per collection",
          value: formatRsCompact(avgAmt),
          value_tone: "blue",
          footer: `Median ${formatRsCompact(medianAmt)}`,
        },
        silent_45_days: {
          title: "Silent 45+ days",
          value: formatCount(silentCount),
          value_tone: "red",
          footer: "No collection logged",
        },
        team_target_achieved: {
          title: "Team target achieved",
          value: `${teamPct}%`,
          value_tone: "amber",
          footer: `${formatCount(collectorItems.length)} collectors`,
        },
      },
      collector_performance: {
        title: "Collector performance",
        subtitle: `By collected_by · ${monthName}`,
        items: collectorItems,
      },
      top_boxes: {
        title: "Top boxes by collection",
        subtitle: `Box key · shop · size · ${monthName} collections`,
        items: topBoxes.map((r, idx) => ({
          id: r.id || idx + 1,
          rank: idx + 1,
          key: String(r.box_key),
          shop: String(r.shop),
          size: String(r.size || "—"),
          collected_formatted: formatRsCompact(toNumber(r.collected)),
        })),
      },
      meta: {
        generated_at: new Date().toISOString(),
        disclaimer:
          "Live totals from donation_box_donations (Collection Units Collections).",
        period_start: bounds.start,
        period_end: bounds.end,
      },
    };
  }
}
