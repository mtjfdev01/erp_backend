import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  formatCount,
  formatPkrCompact,
  monthBounds,
  toNumber,
} from "./report-format.util";

export interface DonorProfilesDemographicsQuery {
  period?: string; // YYYY-MM | last_12_months | this_month
  donor_type?: string; // all | individual | csr
  top_limit?: number;
}

const COMPLETED = `('completed', 'success', 'paid', 'verified')`;

@Injectable()
export class DonorProfilesDemographicsService {
  private readonly logger = new Logger(DonorProfilesDemographicsService.name);

  constructor(private readonly dataSource: DataSource) {}

  private async q(sql: string, params: any[] = []): Promise<any[]> {
    try {
      return await this.dataSource.query(sql, params);
    } catch (err: any) {
      this.logger.warn(
        `Donor profiles query failed: ${err?.message || err}`,
      );
      return [];
    }
  }

  private periodWindow(period?: string): {
    start: string;
    end: string;
    label: string;
    key: string;
  } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (!period || period === "last_12_months") {
      const startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      startDate.setDate(startDate.getDate() + 1);
      return {
        start: `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`,
        end: today,
        label: "Last 12 months",
        key: "last_12_months",
      };
    }
    if (period === "this_month") {
      const b = monthBounds();
      return {
        start: b.start,
        end: today < b.end ? today : b.end,
        label: b.label,
        key: "this_month",
      };
    }
    if (/^\d{4}-\d{2}$/.test(period)) {
      const b = monthBounds(period);
      return {
        start: b.start,
        end: b.end,
        label: b.label,
        key: period,
      };
    }
    const b = monthBounds();
    return {
      start: b.start,
      end: today < b.end ? today : b.end,
      label: "Last 12 months",
      key: "last_12_months",
    };
  }

  private channelLabel(method: string | null): string {
    const m = String(method || "").toLowerCase();
    if (["stripe", "payfast", "card", "online", "credit_card", "website"].includes(m))
      return "Online";
    if (["bank_transfer", "bank", "transfer", "ibft"].includes(m)) return "Bank";
    if (["cheque", "check"].includes(m)) return "Cheque";
    if (["cash"].includes(m)) return "Cash";
    if (["recurring", "subscription"].includes(m)) return "Recurring";
    if (["donation_box", "box", "collection"].includes(m)) return "Box";
    if (!m) return "—";
    return method!;
  }

  async getOverview(query: DonorProfilesDemographicsQuery = {}) {
    const window = this.periodWindow(query.period);
    const donorType = String(query.donor_type || "all").toLowerCase();
    const topLimit = Math.min(100, Math.max(8, toNumber(query.top_limit, 8)));

    const typeClause =
      donorType === "individual" || donorType === "csr"
        ? `AND LOWER(dnr.donor_type::text) = $3`
        : "";
    const donorParams: any[] =
      donorType === "individual" || donorType === "csr"
        ? [window.start, window.end, donorType]
        : [window.start, window.end];

    // Per-donor period giving
    const donorAgg = await this.q(
      `
      SELECT
        d.donor_id,
        COALESCE(
          NULLIF(TRIM(dnr.name), ''),
          NULLIF(TRIM(CONCAT(COALESCE(dnr.first_name, ''), ' ', COALESCE(dnr.last_name, ''))), ''),
          CONCAT('Donor #D-', d.donor_id)
        ) AS donor_name,
        LOWER(COALESCE(dnr.donor_type::text, 'individual')) AS donor_type,
        COALESCE(NULLIF(TRIM(dnr.city), ''), NULLIF(TRIM(dnr.country), ''), '—') AS location,
        dnr.assigned_to AS assigned_to_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.email
        ) AS owner_name,
        dnr.date_of_birth,
        COUNT(*)::int AS gifts,
        COALESCE(SUM(COALESCE(d.paid_amount, d.amount, 0)), 0) AS given,
        MAX(d.date) AS last_gift,
        ARRAY_AGG(DISTINCT LOWER(COALESCE(d.donation_method, d.donation_source, ''))) AS methods
      FROM donations d
      INNER JOIN donors dnr ON dnr.id = d.donor_id
      LEFT JOIN "user" u ON u.id = dnr.assigned_to
      WHERE COALESCE(d.is_archived, false) = false
        AND COALESCE(dnr.is_archived, false) = false
        AND d.donor_id IS NOT NULL
        AND LOWER(COALESCE(d.status, '')) IN ${COMPLETED}
        AND d.date >= $1::date
        AND d.date <= $2::date
        ${typeClause}
      GROUP BY
        d.donor_id, dnr.name, dnr.first_name, dnr.last_name, dnr.donor_type,
        dnr.city, dnr.country, dnr.assigned_to, u.first_name, u.last_name, u.email,
        dnr.date_of_birth
      `,
      donorParams,
    );

    const donors = donorAgg.map((row) => {
      const methods = Array.isArray(row.methods) ? row.methods : [];
      const channels = [
        ...new Set(
          methods
            .map((m: string) => this.channelLabel(m))
            .filter((c) => c && c !== "—"),
        ),
      ];
      return {
        donor_id: toNumber(row.donor_id),
        donor_name: String(row.donor_name || "Unknown"),
        donor_type: String(row.donor_type || "individual"),
        location: String(row.location || "—"),
        assigned_to_id: toNumber(row.assigned_to_id) || null,
        owner_name: row.owner_name ? String(row.owner_name) : null,
        has_dob: !!row.date_of_birth,
        gifts: toNumber(row.gifts),
        given: toNumber(row.given),
        last_gift: row.last_gift,
        channels,
      };
    });

    donors.sort((a, b) => b.given - a.given);

    const uniqueDonors = donors.length;
    const totalIncome = donors.reduce((s, d) => s + d.given, 0);
    const rawGiftCount = donors.reduce((s, d) => s + d.gifts, 0);

    // Top 10% concentration
    const top10Count = Math.max(1, Math.ceil(uniqueDonors * 0.1));
    const top10Sum = donors
      .slice(0, top10Count)
      .reduce((s, d) => s + d.given, 0);
    const top10Pct =
      totalIncome > 0 ? Math.round((top10Sum / totalIncome) * 100) : 0;

    // Lifetime stats (all-time completed) for median/avg
    const lifetimeTypeClause =
      donorType === "individual" || donorType === "csr"
        ? `AND LOWER(dnr.donor_type::text) = $1`
        : "";
    const lifetimeParams =
      donorType === "individual" || donorType === "csr" ? [donorType] : [];
    const lifetimeRows = await this.q(
      `
      SELECT
        d.donor_id,
        COALESCE(SUM(COALESCE(d.paid_amount, d.amount, 0)), 0) AS lifetime
      FROM donations d
      INNER JOIN donors dnr ON dnr.id = d.donor_id
      WHERE COALESCE(d.is_archived, false) = false
        AND COALESCE(dnr.is_archived, false) = false
        AND d.donor_id IS NOT NULL
        AND LOWER(COALESCE(d.status, '')) IN ${COMPLETED}
        ${lifetimeTypeClause}
      GROUP BY d.donor_id
      `,
      lifetimeParams,
    );
    const lifetimes = lifetimeRows
      .map((r) => toNumber(r.lifetime))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const avgLtv =
      lifetimes.length > 0
        ? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length
        : 0;
    const medianLtv =
      lifetimes.length === 0
        ? 0
        : lifetimes.length % 2 === 1
          ? lifetimes[(lifetimes.length - 1) / 2]
          : (lifetimes[lifetimes.length / 2 - 1] +
              lifetimes[lifetimes.length / 2]) /
            2;

    // Major donors unassigned (period giving >= 500k)
    const majorUnassigned = donors.filter(
      (d) => d.given >= 500_000 && !d.assigned_to_id,
    ).length;

    // Age / gender coverage — DOB exists; gender not in schema
    const withDob = donors.filter((d) => d.has_dob).length;
    const dobPct =
      uniqueDonors > 0 ? Math.round((withDob / uniqueDonors) * 100) : 0;

    // Giving tiers (period)
    const tiersDef = [
      {
        id: "major",
        title: "Major (PKR 500K+ a year)",
        min: 500_000,
        max: Infinity,
        action: "Named relationship manager, personal visits",
      },
      {
        id: "mid",
        title: "Mid-level (PKR 100K–500K)",
        min: 100_000,
        max: 500_000,
        action: "Quarterly impact report + call",
      },
      {
        id: "regular",
        title: "Regular (PKR 10K–100K)",
        min: 10_000,
        max: 100_000,
        action: "Convert to monthly membership",
      },
      {
        id: "small",
        title: "Small (Under PKR 10K)",
        min: 0,
        max: 10_000,
        action: "Automated WhatsApp journeys",
      },
    ];

    const tiers = tiersDef.map((t) => {
      const members = donors.filter((d) => d.given >= t.min && d.given < t.max);
      const count = members.length;
      const income = members.reduce((s, d) => s + d.given, 0);
      return {
        id: t.id,
        title: t.title,
        donors_count: count,
        donors_pct:
          uniqueDonors > 0 ? Math.round((count / uniqueDonors) * 100) : 0,
        income_formatted: formatPkrCompact(income),
        income_pct:
          totalIncome > 0 ? Math.round((income / totalIncome) * 100) : 0,
        action: `${formatCount(count)} donors → ${t.action}`,
      };
    });

    const formatDate = (v: any) => {
      if (!v) return "—";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    };

    const topDonors = donors.slice(0, topLimit).map((d, idx) => ({
      id: d.donor_id,
      rank: idx + 1,
      donor_label: `Donor #D-${String(d.donor_id).padStart(4, "0")}`,
      donor_name: d.donor_name,
      meta: `${d.donor_type === "csr" ? "CSR" : "Individual"} · ${d.location}`,
      given_formatted: formatPkrCompact(d.given),
      gifts: d.gifts,
      last_gift: formatDate(d.last_gift),
      channels: d.channels.length ? d.channels.join(", ") : "—",
      owner: d.owner_name || "Unassigned",
      owner_unassigned: !d.assigned_to_id,
    }));

    return {
      sample_data: false,
      badge: "Live DMS donors & donations",
      access_note: "Management & CRD head",
      title: "Donor Profiles & Demographics",
      subtitle:
        "Who gives most · lifetime giving per de-duplicated donor · selected period",
      filters: {
        period: window.key,
        period_label: window.label,
        donor_type: donorType,
        top_limit: topLimit,
      },
      cards: {
        unique_donors: {
          title: "Unique donors",
          value: formatCount(uniqueDonors),
          footer: `${formatCount(rawGiftCount)} gifts after de-duplication`,
        },
        top10_share: {
          title: "Top 10% of donors give",
          value: `${top10Pct}%`,
          footer: "of all individual income in period",
          value_tone: "default",
        },
        median_ltv: {
          title: "Median lifetime giving",
          value: formatPkrCompact(medianLtv),
          footer: `Average ${formatPkrCompact(avgLtv)} (skewed)`,
        },
        major_unassigned: {
          title: "Major donors unassigned",
          value: formatCount(majorUnassigned),
          footer: "No relationship owner (PKR 500K+ in period)",
          value_tone: majorUnassigned > 0 ? "red" : "green",
        },
        age_gender: {
          title: "Age / gender recorded",
          value: `${dobPct}%`,
          footer:
            dobPct === 0
              ? "DOB sparse · gender not in DMS yet"
              : `DOB on ${formatCount(withDob)} donors · gender not in DMS`,
          value_tone: dobPct < 20 ? "red" : "amber",
        },
      },
      top_donors: {
        title: "Top donors",
        subtitle:
          "Ranked by giving in period · names visible to permitted roles only",
        items: topDonors,
      },
      giving_tiers: {
        title: "Giving tiers",
        subtitle: "Few donors, most of the money — share of donors vs share of income",
        items: tiers,
      },
      meta: {
        generated_at: new Date().toISOString(),
        period_start: window.start,
        period_end: window.end,
        total_income_formatted: formatPkrCompact(totalIncome),
      },
    };
  }
}
