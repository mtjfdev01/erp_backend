import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { monthBounds, toNumber } from "./report-format.util";

export interface CampaignRoiQuery {
  period?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class CampaignRoiService {
  constructor(private readonly dataSource: DataSource) {}

  async getOverview(query: CampaignRoiQuery = {}) {
    const bounds = monthBounds(query.period);
    const period =
      query.period ||
      `${bounds.year}-${String(bounds.monthIndex + 1).padStart(2, "0")}`;
    const hasCustomRange =
      /^\d{4}-\d{2}-\d{2}$/.test(query.from || "") &&
      /^\d{4}-\d{2}-\d{2}$/.test(query.to || "") &&
      String(query.from) <= String(query.to);
    const rangeStart = hasCustomRange ? String(query.from) : bounds.start;
    const rangeEnd = hasCustomRange ? String(query.to) : bounds.end;
    const rangeLabel = hasCustomRange
      ? `${rangeStart} to ${rangeEnd}`
      : bounds.label;

    const campaigns = await this.dataSource.query(`
      SELECT id, title, slug, goal_amount, currency
      FROM campaigns
      WHERE COALESCE(is_archived, false) = false
        AND LOWER(COALESCE(status, '')) = 'active'
      ORDER BY title ASC
    `);

    const donations = await this.dataSource.query(
      `
      SELECT
        d.campaign_id,
        COALESCE(d.paid_amount, d.amount, 0) AS amount,
        d.donor_id,
        COALESCE(d.date, d.created_at::date) AS activity_date,
        COALESCE(NULLIF(TRIM(LOWER(d.utm_source)), ''), 'other / direct') AS source
      FROM donations d
      INNER JOIN campaigns c ON c.id = d.campaign_id
      WHERE COALESCE(d.is_archived, false) = false
        AND COALESCE(c.is_archived, false) = false
        AND LOWER(COALESCE(c.status, '')) = 'active'
        AND LOWER(COALESCE(d.status, '')) IN ('completed', 'paid', 'success')
        AND COALESCE(d.date, d.created_at::date) >= $1::date
        AND COALESCE(d.date, d.created_at::date) <= $2::date
      `,
      [rangeStart, rangeEnd],
    );

    const spends = await this.dataSource.query(
      `
      SELECT
        s.campaign_id,
        COALESCE(s.amount, 0) AS amount,
        COALESCE(s.spend_date, s.created_at::date) AS activity_date
      FROM campaign_ad_spends s
      INNER JOIN campaigns c ON c.id = s.campaign_id
      WHERE COALESCE(s.is_archived, false) = false
        AND COALESCE(c.is_archived, false) = false
        AND LOWER(COALESCE(c.status, '')) = 'active'
        AND COALESCE(s.spend_date, s.created_at::date) >= $1::date
        AND COALESCE(s.spend_date, s.created_at::date) <= $2::date
      `,
      [rangeStart, rangeEnd],
    );

    const donationByCampaign = new Map<
      number,
      { collected: number; donors: Set<number> }
    >();
    const sourceMap = new Map<string, number>();
    const rangeStartDate = new Date(`${rangeStart}T00:00:00Z`);
    const rangeEndDate = new Date(`${rangeEnd}T00:00:00Z`);
    const rangeDays =
      Math.floor(
        (rangeEndDate.getTime() - rangeStartDate.getTime()) / 86_400_000,
      ) + 1;
    const weekCount = Math.max(1, Math.ceil(rangeDays / 7));
    const weekly = Array.from({ length: weekCount }, (_, index) => ({
      id: index + 1,
      label: `Week ${index + 1}`,
      collected: 0,
      spent: 0,
    }));

    for (const row of donations) {
      const campaignId = toNumber(row.campaign_id);
      const amount = toNumber(row.amount);
      const entry = donationByCampaign.get(campaignId) || {
        collected: 0,
        donors: new Set<number>(),
      };
      entry.collected += amount;
      const donorId = toNumber(row.donor_id);
      if (donorId > 0) entry.donors.add(donorId);
      donationByCampaign.set(campaignId, entry);

      const source = String(row.source || "other / direct");
      sourceMap.set(source, (sourceMap.get(source) || 0) + amount);

      const activityDate = new Date(`${String(row.activity_date).slice(0, 10)}T00:00:00Z`);
      const dayOffset = Math.floor(
        (activityDate.getTime() - rangeStartDate.getTime()) / 86_400_000,
      );
      const weekIndex = Math.min(
        weekCount - 1,
        Math.max(0, Math.floor(dayOffset / 7)),
      );
      weekly[weekIndex].collected += amount;
    }

    const spendByCampaign = new Map<number, number>();
    for (const row of spends) {
      const campaignId = toNumber(row.campaign_id);
      const amount = toNumber(row.amount);
      spendByCampaign.set(
        campaignId,
        (spendByCampaign.get(campaignId) || 0) + amount,
      );
      const activityDate = new Date(`${String(row.activity_date).slice(0, 10)}T00:00:00Z`);
      const dayOffset = Math.floor(
        (activityDate.getTime() - rangeStartDate.getTime()) / 86_400_000,
      );
      const weekIndex = Math.min(
        weekCount - 1,
        Math.max(0, Math.floor(dayOffset / 7)),
      );
      weekly[weekIndex].spent += amount;
    }

    const campaignRows = campaigns.map((campaign) => {
      const id = toNumber(campaign.id);
      const target = toNumber(campaign.goal_amount);
      const collected = donationByCampaign.get(id)?.collected || 0;
      const spent = spendByCampaign.get(id) || 0;
      const netRaised = collected - spent;
      return {
        id,
        title: String(campaign.title || `Campaign #${id}`),
        slug: campaign.slug || null,
        currency: campaign.currency || "PKR",
        target,
        collected,
        achieved_pct:
          target > 0 ? Math.round((collected / target) * 1000) / 10 : null,
        unique_donors: donationByCampaign.get(id)?.donors.size || 0,
        spent,
        cost_per_100:
          collected > 0 ? Math.round((spent / collected) * 10000) / 100 : null,
        net_roi_pct:
          spent > 0 ? Math.round((netRaised / spent) * 1000) / 10 : null,
      };
    });

    const totalCollected = donations.reduce(
      (sum, row) => sum + toNumber(row.amount),
      0,
    );
    const totalSpent = spends.reduce(
      (sum, row) => sum + toNumber(row.amount),
      0,
    );
    const totalTarget = campaigns.reduce(
      (sum, row) => sum + toNumber(row.goal_amount),
      0,
    );
    const netRaised = totalCollected - totalSpent;

    const sources = [...sourceMap.entries()]
      .map(([source, collected]) => ({
        source,
        collected,
        share_pct:
          totalCollected > 0
            ? Math.round((collected / totalCollected) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.collected - a.collected);

    return {
      title: "Campaign ROI",
      subtitle: `Active campaigns · ${rangeLabel} · Completed donations`,
      filters: {
        period,
        period_label: rangeLabel,
        from: hasCustomRange ? rangeStart : null,
        to: hasCustomRange ? rangeEnd : null,
      },
      summary: {
        total_collected: totalCollected,
        fundraising_target: totalTarget,
        target_achieved_pct:
          totalTarget > 0
            ? Math.round((totalCollected / totalTarget) * 1000) / 10
            : null,
        total_spent: totalSpent,
        net_raised: netRaised,
        cost_per_100:
          totalCollected > 0
            ? Math.round((totalSpent / totalCollected) * 10000) / 100
            : null,
        net_roi_pct:
          totalSpent > 0
            ? Math.round((netRaised / totalSpent) * 1000) / 10
            : null,
      },
      weekly,
      sources,
      campaigns: campaignRows,
      meta: {
        generated_at: new Date().toISOString(),
        period_start: rangeStart,
        period_end: rangeEnd,
      },
    };
  }
}
