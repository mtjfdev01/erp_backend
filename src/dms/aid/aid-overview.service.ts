import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AidApplicationStatus, AidRequestType } from "./aid.enums";
import { AidApplication } from "./entities/aid-application.entity";
import { AidPerson } from "./entities/aid-person.entity";

type PeriodKey = "this_month" | "last_month" | "last_3_months" | "last_6_months";

const PROGRAM_BUDGET_PKR: Record<string, number> = {
  ration: 1_600_000,
  education: 1_600_000,
  financial_assistance: 950_000,
  marriage_gift: 1_000_000,
  clean_water: 750_000,
  apna_ghar: 625_000,
  health: 900_000,
  other: 500_000,
};

const PROGRAM_LABELS: Record<string, string> = {
  ration: "Ration",
  education: "Education",
  financial_assistance: "Financial Assistance",
  marriage_gift: "Marriage",
  clean_water: "Clean Water",
  apna_ghar: "MASKAN",
  health: "Health",
  other: "Other",
};

@Injectable()
export class AidOverviewService {
  constructor(
    @InjectRepository(AidApplication)
    private readonly appRepo: Repository<AidApplication>,
    @InjectRepository(AidPerson)
    private readonly personRepo: Repository<AidPerson>,
  ) {}

  private periodRange(period: PeriodKey = "this_month") {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (period === "this_month") {
      start.setDate(1);
    } else if (period === "last_month") {
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    } else if (period === "last_3_months") {
      start.setMonth(start.getMonth() - 2, 1);
    } else {
      start.setMonth(start.getMonth() - 5, 1);
    }
    return { start, end };
  }

  private prevPeriodRange(period: PeriodKey = "this_month") {
    const { start, end } = this.periodRange(period);
    const ms = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - ms);
    return { start: prevStart, end: prevEnd };
  }

  private daysBetween(a?: Date | string | null, b?: Date | string | null) {
    if (!a || !b) return null;
    const d1 = new Date(a).getTime();
    const d2 = new Date(b).getTime();
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
    return Math.max(0, (d2 - d1) / (1000 * 60 * 60 * 24));
  }

  private recAmount(app: AidApplication): number {
    const rec = app.investigation_recommendation as Record<string, unknown> | null;
    const n = Number(rec?.amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private vulnScore(app: AidApplication): number | null {
    const rec = app.investigation_recommendation as Record<string, unknown> | null;
    const after = Number(rec?.vulnerability_score_after_visit);
    if (Number.isFinite(after)) return after;
    const declared = Number(rec?.vulnerability_score_declared);
    return Number.isFinite(declared) ? declared : null;
  }

  async getOverview(params: {
    period?: string;
    program?: string;
    district?: string;
  }) {
    const period = (params.period || "this_month") as PeriodKey;
    const { start, end } = this.periodRange(period);
    const prev = this.prevPeriodRange(period);
    const program =
      params.program && params.program !== "all" ? params.program : null;

    const qb = this.appRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.beneficiary", "beneficiary")
      .where("a.is_archived = :archived", { archived: false });
    if (program) {
      qb.andWhere("a.requested_aid_type = :program", { program });
    }

    const all = await qb.getMany();

    const inPeriod = (d?: Date | null) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };
    const inPrev = (d?: Date | null) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= prev.start.getTime() && t <= prev.end.getTime();
    };

    const created = all.filter((a) => inPeriod(a.created_at));
    const createdPrev = all.filter((a) => inPrev(a.created_at));
    const approved = all.filter(
      (a) =>
        (a.status === AidApplicationStatus.SUCCESSFUL ||
          a.status === AidApplicationStatus.DELIVERED) &&
        inPeriod(a.ceo_decided_at || a.updated_at),
    );
    const rejected = all.filter(
      (a) =>
        a.status === AidApplicationStatus.REJECTED &&
        inPeriod(a.updated_at || a.ceo_decided_at),
    );
    const delivered = all.filter(
      (a) =>
        a.status === AidApplicationStatus.DELIVERED &&
        inPeriod(a.delivered_at || a.updated_at),
    );
    const verified = all.filter((a) => inPeriod(a.verified_at));

    const decided = [...approved, ...rejected];
    const disbursed = delivered.reduce((s, a) => s + this.recAmount(a), 0);
    const approvedDisbursedFallback = approved.reduce(
      (s, a) => s + this.recAmount(a),
      0,
    );
    const disbursedTotal = disbursed || approvedDisbursedFallback;

    const familyIds = new Set<number>();
    for (const a of approved) {
      if (a.household_id) familyIds.add(a.household_id);
      else if (a.beneficiary_person_id) familyIds.add(a.beneficiary_person_id);
    }

    const decisionDays: number[] = [];
    for (const a of decided) {
      const days = this.daysBetween(
        a.created_at,
        a.ceo_decided_at || a.verified_at || a.updated_at,
      );
      if (days != null) decisionDays.push(days);
    }
    const avgDecisionDays =
      decisionDays.length > 0
        ? decisionDays.reduce((s, n) => s + n, 0) / decisionDays.length
        : null;

    const vulnScores = approved
      .map((a) => this.vulnScore(a))
      .filter((n): n is number => n != null);
    const avgVuln =
      vulnScores.length > 0
        ? Math.round(
            vulnScores.reduce((s, n) => s + n, 0) / vulnScores.length,
          )
        : null;

    const appsCount = created.length;
    const appsPrev = createdPrev.length;
    const appsDeltaPct =
      appsPrev > 0
        ? Math.round(((appsCount - appsPrev) / appsPrev) * 100)
        : null;

    const budgetCap = Object.entries(PROGRAM_BUDGET_PKR)
      .filter(([k]) => !program || k === program)
      .reduce((s, [, v]) => s + v, 0);

    // Pipeline (period)
    const registered = appsCount;
    const submittedCount = created.filter(
      (a) => a.status !== AidApplicationStatus.SUBMITTED || !!a.submitted_at,
    ).length;
    const investigatedCount = verified.length;
    const approvedCount = approved.length;
    const disbursedCount =
      delivered.length ||
      approved.filter((a) => this.recAmount(a) > 0).length;

    const pipeline = [
      { key: "registered", label: "Registered", count: registered },
      { key: "submitted", label: "Submitted", count: submittedCount },
      { key: "investigated", label: "Investigated", count: investigatedCount },
      { key: "approved", label: "Approved", count: approvedCount },
      { key: "disbursed", label: "Disbursed", count: disbursedCount },
    ];
    // Keep funnel non-increasing for display
    let prevC = pipeline[0].count;
    for (let i = 1; i < pipeline.length; i++) {
      if (pipeline[i].count > prevC) pipeline[i].count = prevC;
      prevC = pipeline[i].count;
    }

    const now = new Date();
    const open = all.filter(
      (a) =>
        ![
          AidApplicationStatus.REJECTED,
          AidApplicationStatus.DELIVERED,
        ].includes(a.status),
    );

    const stuckApproval = open.filter((a) => {
      if (a.status !== AidApplicationStatus.CEO_APPROVAL_REQUIRED) return false;
      const days = this.daysBetween(a.verified_at || a.updated_at, now);
      return days != null && days > 5;
    });

    const stuckInvestigation = open.filter((a) => {
      if (
        ![
          AidApplicationStatus.SUBMITTED,
          AidApplicationStatus.UNDER_REVIEW,
        ].includes(a.status)
      ) {
        return false;
      }
      if (a.verified_at) return false;
      const days = this.daysBetween(a.created_at, now);
      return days != null && days > 7;
    });

    const ageBuckets = { d0_5: 0, d6_10: 0, d11_20: 0, d20_plus: 0 };
    for (const a of open) {
      const days = this.daysBetween(a.created_at, now) ?? 0;
      if (days <= 5) ageBuckets.d0_5 += 1;
      else if (days <= 10) ageBuckets.d6_10 += 1;
      else if (days <= 20) ageBuckets.d11_20 += 1;
      else ageBuckets.d20_plus += 1;
    }

    const awaitingCeo = all.filter(
      (a) => a.status === AidApplicationStatus.CEO_APPROVAL_REQUIRED,
    );
    let oldestCeoDays: number | null = null;
    for (const a of awaitingCeo) {
      const days = this.daysBetween(a.verified_at || a.created_at, now);
      if (days != null && (oldestCeoDays == null || days > oldestCeoDays)) {
        oldestCeoDays = Math.floor(days);
      }
    }

    // Families with 3+ successful apps since 2024
    const since2024 = new Date("2024-01-01T00:00:00Z");
    const successByPerson = new Map<number, number>();
    for (const a of all) {
      if (
        ![
          AidApplicationStatus.SUCCESSFUL,
          AidApplicationStatus.DELIVERED,
        ].includes(a.status)
      ) {
        continue;
      }
      if (new Date(a.created_at) < since2024) continue;
      const pid = a.beneficiary_person_id;
      successByPerson.set(pid, (successByPerson.get(pid) || 0) + 1);
    }
    const multiBenefitFamilies = [...successByPerson.values()].filter(
      (n) => n >= 3,
    ).length;

    const overrideAgainstAdvice = all.filter((a) => {
      if (
        ![
          AidApplicationStatus.SUCCESSFUL,
          AidApplicationStatus.DELIVERED,
        ].includes(a.status)
      ) {
        return false;
      }
      const rec = a.investigation_recommendation as Record<string, unknown> | null;
      return String(rec?.decision || "") === "reject";
    }).length;

    // Duplicate CNIC: people sharing same CNIC (blocked attempts proxy)
    let duplicateCnicAttempts = 0;
    try {
      const cnicRows = await this.personRepo
        .createQueryBuilder("p")
        .select("p.cnic", "cnic")
        .addSelect("COUNT(*)", "cnt")
        .where("p.is_archived = :archived", { archived: false })
        .andWhere("p.cnic IS NOT NULL")
        .andWhere("TRIM(p.cnic) != ''")
        .groupBy("p.cnic")
        .having("COUNT(*) > 1")
        .getRawMany();
      duplicateCnicAttempts = cnicRows.reduce((s, r) => {
        const cnt = Number(r.cnt);
        return s + (Number.isFinite(cnt) ? Math.max(0, cnt - 1) : 0);
      }, 0);
    } catch {
      duplicateCnicAttempts = 0;
    }

    // Monthly apps vs approvals (last 6 months)
    const monthly: { month: string; applications: number; approved: number }[] =
      [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const label = mStart.toLocaleString("en-US", { month: "short" });
      const apps = all.filter((a) => {
        const t = new Date(a.created_at).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      }).length;
      const appr = all.filter((a) => {
        if (
          ![
            AidApplicationStatus.SUCCESSFUL,
            AidApplicationStatus.DELIVERED,
          ].includes(a.status)
        ) {
          return false;
        }
        const d = a.ceo_decided_at || a.updated_at;
        const t = new Date(d).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      }).length;
      monthly.push({ month: label, applications: apps, approved: appr });
    }

    // Program performance
    const types = Object.values(AidRequestType).filter(
      (t) => !["cash", "medical"].includes(t),
    );
    const program_performance = types
      .map((type) => {
        const typeApps = all.filter(
          (a) =>
            a.requested_aid_type === type && inPeriod(a.created_at),
        );
        const typeApproved = all.filter(
          (a) =>
            a.requested_aid_type === type &&
            (a.status === AidApplicationStatus.SUCCESSFUL ||
              a.status === AidApplicationStatus.DELIVERED) &&
            inPeriod(a.ceo_decided_at || a.updated_at),
        );
        const typeDisbursed = typeApproved.reduce(
          (s, a) => s + this.recAmount(a),
          0,
        );
        const budget = PROGRAM_BUDGET_PKR[type] || PROGRAM_BUDGET_PKR.other;
        const budgetUsed = budget > 0 ? Math.round((typeDisbursed / budget) * 100) : 0;
        const scores = typeApproved
          .map((a) => this.vulnScore(a))
          .filter((n): n is number => n != null);
        const avg =
          scores.length > 0
            ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
            : null;
        return {
          program: type,
          label: PROGRAM_LABELS[type] || type,
          applications: typeApps.length,
          approved: typeApproved.length,
          approval_rate:
            typeApps.length > 0
              ? Math.round((typeApproved.length / typeApps.length) * 100)
              : 0,
          disbursed: typeDisbursed,
          budget,
          budget_used_pct: Math.min(100, budgetUsed),
          avg_vulnerability: avg,
        };
      })
      .filter((r) => r.applications > 0 || r.approved > 0)
      .sort((a, b) => b.applications - a.applications);

    const periodLabel = start.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    return {
      filters: {
        period,
        program: program || "all",
        district: params.district || "all",
        period_label: periodLabel,
      },
      kpis: {
        applications: appsCount,
        applications_delta_pct: appsDeltaPct,
        approved: approvedCount,
        approved_of_decisions_pct:
          decided.length > 0
            ? Math.round((approvedCount / decided.length) * 100)
            : null,
        disbursed: disbursedTotal,
        budget: budgetCap,
        budget_used_pct:
          budgetCap > 0 ? Math.round((disbursedTotal / budgetCap) * 100) : null,
        families_supported: familyIds.size,
        intake_to_decision_days:
          avgDecisionDays != null
            ? Math.round(avgDecisionDays * 10) / 10
            : null,
        intake_target_days: 10,
        avg_vulnerability: avgVuln,
      },
      pipeline: {
        stages: pipeline,
        decided: decided.length,
        approved: approvedCount,
        rejected: rejected.length,
        returned: all.filter(
          (a) =>
            inPeriod(a.updated_at) &&
            a.status === AidApplicationStatus.UNDER_REVIEW &&
            !!a.verified_at,
        ).length,
      },
      stuck: {
        investigation_overdue: stuckInvestigation.length,
        approval_overdue: stuckApproval.length,
        age_of_open_cases: [
          { key: "0-5", label: "0–5 days", count: ageBuckets.d0_5 },
          { key: "6-10", label: "6–10 days", count: ageBuckets.d6_10 },
          { key: "11-20", label: "11–20 days", count: ageBuckets.d11_20 },
          { key: "20+", label: "20+ days", count: ageBuckets.d20_plus },
        ],
      },
      management_attention: [
        {
          key: "awaiting_ceo",
          count: awaitingCeo.length,
          title: "Awaiting CEO approval",
          subtitle:
            oldestCeoDays != null
              ? `Above the committee limit · oldest ${oldestCeoDays} day${oldestCeoDays === 1 ? "" : "s"}`
              : "No cases waiting",
          tone: "danger",
        },
        {
          key: "multi_benefit",
          count: multiBenefitFamilies,
          title: "Families with 3+ benefits across linked families",
          subtitle: "Since 2024 · review before next approval",
          tone: "warn",
        },
        {
          key: "override_advice",
          count: overrideAgainstAdvice,
          title: "Approved against investigator advice",
          subtitle: "Committee overrode a reject recommendation",
          tone: "warn",
        },
        {
          key: "duplicate_cnic",
          count: duplicateCnicAttempts,
          title: "Duplicate CNIC attempts blocked",
          subtitle: "Same CNIC already head of another family",
          tone: "muted",
        },
      ],
      monthly_apps_vs_approvals: monthly,
      program_performance,
    };
  }
}
