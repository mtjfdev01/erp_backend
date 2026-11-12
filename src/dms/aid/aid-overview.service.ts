import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AidApplicationStatus, AidRequestType } from "./aid.enums";
import { AidApplication } from "./entities/aid-application.entity";
import { AidPerson } from "./entities/aid-person.entity";

const PROGRAM_BUDGET_PKR: Record<string, number> = {
  ration: 1_600_000,
  education: 1_600_000,
  community_services: 1_970_000,
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
  community_services: "Community Services",
  financial_assistance: "Financial Assistance",
  marriage_gift: "Marriage",
  clean_water: "Clean Water",
  apna_ghar: "MASKAN",
  health: "Health",
  other: "Other",
};

/** Intake / Beneficiary Registration — excluded from welfare overview. */
const DATA_ENTRY_STATUSES = new Set<string>([
  AidApplicationStatus.DRAFT,
  AidApplicationStatus.INCOMPLETE,
  AidApplicationStatus.INCOMPLETE_DOCS,
]);

/** Cases still in the welfare pipeline (not closed). */
const OPEN_STATUSES = new Set<string>([
  AidApplicationStatus.SUBMITTED,
  AidApplicationStatus.UNDER_REVIEW,
  AidApplicationStatus.VERIFICATION_COMPLETED,
  AidApplicationStatus.MANAGER_REVIEW,
  AidApplicationStatus.CEO_APPROVAL_REQUIRED,
  AidApplicationStatus.SUCCESSFUL,
]);

const INVESTIGATION_STUCK_STATUSES = new Set<string>([
  AidApplicationStatus.SUBMITTED,
  AidApplicationStatus.UNDER_REVIEW,
]);

const APPROVED_STATUSES = new Set<string>([
  AidApplicationStatus.SUCCESSFUL,
  AidApplicationStatus.DELIVERED,
]);

@Injectable()
export class AidOverviewService {
  constructor(
    @InjectRepository(AidApplication)
    private readonly appRepo: Repository<AidApplication>,
    @InjectRepository(AidPerson)
    private readonly personRepo: Repository<AidPerson>,
  ) {}

  private parseYmd(value?: string | null): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    const [y, m, d] = value.trim().split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (
      !Number.isFinite(dt.getTime()) ||
      dt.getFullYear() !== y ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return dt;
  }

  private startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  /**
   * Resolve date / date-range filters.
   * No dates → all-time (same universe as Applications listing).
   */
  private resolveDateRange(params: {
    date?: string;
    start_date?: string;
    end_date?: string;
  }) {
    const single = this.parseYmd(params.date);
    const rangeStart = this.parseYmd(params.start_date);
    const rangeEnd = this.parseYmd(params.end_date);

    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    let mode: "date" | "range" | "all" = "all";

    if (rangeStart || rangeEnd) {
      mode = "range";
      const a = rangeStart || rangeEnd || now;
      const b = rangeEnd || rangeStart || now;
      if (a.getTime() <= b.getTime()) {
        start = this.startOfDay(a);
        end = this.endOfDay(b);
      } else {
        start = this.startOfDay(b);
        end = this.endOfDay(a);
      }
    } else if (single) {
      mode = "date";
      start = this.startOfDay(single);
      end = this.endOfDay(single);
    }

    return { start, end, mode };
  }

  private prevRange(start: Date, end: Date) {
    const ms = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - ms);
    return { start: prevStart, end: prevEnd };
  }

  private formatRangeLabel(
    start: Date | null,
    end: Date | null,
    mode: string,
  ) {
    if (mode === "all" || !start || !end) return "All time";
    const sameDay =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();
    if (mode === "date" || sameDay) {
      return start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    const opts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    };
    return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
  }

  private inRange(
    d: Date | string | null | undefined,
    start: Date | null,
    end: Date | null,
  ) {
    if (!start || !end) return true;
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
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

  private isApprovedStatus(status: string) {
    return APPROVED_STATUSES.has(status);
  }

  /** Reached / passed investigation (visit report or later stage). */
  private hasBeenInvestigated(app: AidApplication) {
    if (app.verified_at) return true;
    return [
      AidApplicationStatus.VERIFICATION_COMPLETED,
      AidApplicationStatus.MANAGER_REVIEW,
      AidApplicationStatus.CEO_APPROVAL_REQUIRED,
      AidApplicationStatus.SUCCESSFUL,
      AidApplicationStatus.DELIVERED,
      AidApplicationStatus.REJECTED,
    ].includes(app.status as AidApplicationStatus);
  }

  private isDataEntry(app: AidApplication) {
    return DATA_ENTRY_STATUSES.has(app.status);
  }

  /** Left intake / draft-like states. */
  private hasBeenSubmitted(app: AidApplication) {
    if (this.isDataEntry(app)) return false;
    if (app.submitted_at) return true;
    return true;
  }

  async getOverview(params: {
    date?: string;
    start_date?: string;
    end_date?: string;
    program?: string;
  }) {
    const { start, end, mode } = this.resolveDateRange(params);
    const program =
      params.program && params.program !== "all" ? params.program : null;

    const qb = this.appRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.beneficiary", "beneficiary")
      .where("a.is_archived = :archived", { archived: false });
    if (program) {
      qb.andWhere("a.requested_aid_type = :program", { program });
    }

    const fetched = await qb.getMany();
    // Welfare overview ignores data-entry / drafts until they enter the pipeline.
    const all = fetched.filter((a) => !this.isDataEntry(a));

    // Same base set for Applications KPI, pipeline, stuck, and program rows.
    const scoped = all.filter((a) => this.inRange(a.created_at, start, end));

    const prev =
      mode !== "all" && start && end ? this.prevRange(start, end) : null;
    const scopedPrev = prev
      ? all.filter((a) => this.inRange(a.created_at, prev.start, prev.end))
      : [];

    const appsCount = scoped.length;
    const appsPrev = scopedPrev.length;
    const appsDeltaPct =
      prev && appsPrev > 0
        ? Math.round(((appsCount - appsPrev) / appsPrev) * 100)
        : null;

    // Outcomes within the same created-in-range cohort (not a separate date lens).
    const approved = scoped.filter((a) => this.isApprovedStatus(a.status));
    const rejected = scoped.filter(
      (a) => a.status === AidApplicationStatus.REJECTED,
    );
    const delivered = scoped.filter(
      (a) => a.status === AidApplicationStatus.DELIVERED,
    );
    const returned = scoped.filter(
      (a) =>
        a.status === AidApplicationStatus.UNDER_REVIEW && !!a.verified_at,
    );

    const disbursedTotal = delivered.reduce(
      (s, a) => s + this.recAmount(a),
      0,
    );

    const familyIds = new Set<number>();
    for (const a of approved) {
      if (a.household_id) familyIds.add(a.household_id);
      else if (a.beneficiary_person_id) familyIds.add(a.beneficiary_person_id);
    }

    const decidedForSla = [...approved, ...rejected];
    const decisionDays: number[] = [];
    for (const a of decidedForSla) {
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

    const budgetCap = Object.entries(PROGRAM_BUDGET_PKR)
      .filter(([k]) => !program || k === program)
      .reduce((s, [, v]) => s + v, 0);

    // Pipeline = cumulative reach on the same Applications cohort
    const registered = appsCount;
    const submittedCount = scoped.filter((a) => this.hasBeenSubmitted(a)).length;
    const investigatedCount = scoped.filter((a) =>
      this.hasBeenInvestigated(a),
    ).length;
    const approvedCount = approved.length;
    const disbursedCount = delivered.length;

    const pipeline = [
      { key: "registered", label: "Registered", count: registered },
      { key: "submitted", label: "Submitted", count: submittedCount },
      { key: "investigated", label: "Investigated", count: investigatedCount },
      { key: "approved", label: "Approved", count: approvedCount },
      { key: "disbursed", label: "Disbursed", count: disbursedCount },
    ];

    const now = new Date();
    const open = scoped.filter((a) => OPEN_STATUSES.has(a.status));

    const stuckApproval = open.filter((a) => {
      if (a.status !== AidApplicationStatus.CEO_APPROVAL_REQUIRED) return false;
      const days = this.daysBetween(a.verified_at || a.updated_at, now);
      return days != null && days > 5;
    });

    const stuckInvestigation = open.filter((a) => {
      if (!INVESTIGATION_STUCK_STATUSES.has(a.status)) return false;
      if (a.verified_at) return false;
      const days = this.daysBetween(a.submitted_at || a.created_at, now);
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

    const awaitingCeo = scoped.filter(
      (a) => a.status === AidApplicationStatus.CEO_APPROVAL_REQUIRED,
    );
    let oldestCeoDays: number | null = null;
    for (const a of awaitingCeo) {
      const days = this.daysBetween(a.verified_at || a.created_at, now);
      if (days != null && (oldestCeoDays == null || days > oldestCeoDays)) {
        oldestCeoDays = Math.floor(days);
      }
    }

    const since2024 = new Date("2024-01-01T00:00:00Z");
    const successByPerson = new Map<number, number>();
    for (const a of all) {
      if (!this.isApprovedStatus(a.status)) continue;
      if (new Date(a.created_at) < since2024) continue;
      const pid = a.beneficiary_person_id;
      if (!pid) continue;
      successByPerson.set(pid, (successByPerson.get(pid) || 0) + 1);
    }
    const multiBenefitFamilies = [...successByPerson.values()].filter(
      (n) => n >= 3,
    ).length;

    const overrideAgainstAdvice = scoped.filter((a) => {
      if (!this.isApprovedStatus(a.status)) return false;
      const rec = a.investigation_recommendation as Record<string, unknown> | null;
      const d = String(rec?.decision || "");
      return d === "not_recommend" || d === "reject";
    }).length;

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

    const monthly: { month: string; applications: number; approved: number }[] =
      [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = mStart.toLocaleString("en-US", { month: "short" });
      const programFiltered = program
        ? all.filter((a) => a.requested_aid_type === program)
        : all;
      const apps = programFiltered.filter((a) => {
        const t = new Date(a.created_at).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      }).length;
      const appr = programFiltered.filter((a) => {
        if (!this.isApprovedStatus(a.status)) return false;
        const d = a.ceo_decided_at || a.updated_at;
        const t = new Date(d).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      }).length;
      monthly.push({ month: label, applications: apps, approved: appr });
    }

    const types = Object.values(AidRequestType).filter(
      (t) => !["cash", "medical"].includes(t),
    );
    const program_performance = types
      .map((type) => {
        const typeApps = scoped.filter((a) => a.requested_aid_type === type);
        const typeApproved = typeApps.filter((a) =>
          this.isApprovedStatus(a.status),
        );
        const typeDisbursed = typeApproved
          .filter((a) => a.status === AidApplicationStatus.DELIVERED)
          .reduce((s, a) => s + this.recAmount(a), 0);
        const budget = PROGRAM_BUDGET_PKR[type] || PROGRAM_BUDGET_PKR.other;
        const budgetUsed =
          budget > 0 ? Math.round((typeDisbursed / budget) * 100) : 0;
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

    const decidedCount = approvedCount + rejected.length + returned.length;
    const rangeLabel = this.formatRangeLabel(start, end, mode);

    return {
      filters: {
        date: params.date || null,
        start_date: params.start_date || null,
        end_date: params.end_date || null,
        program: program || "all",
        range_label: rangeLabel,
      },
      kpis: {
        applications: appsCount,
        applications_delta_pct: appsDeltaPct,
        approved: approvedCount,
        approved_of_decisions_pct:
          approvedCount + rejected.length > 0
            ? Math.round(
                (approvedCount / (approvedCount + rejected.length)) * 100,
              )
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
        decided: decidedCount,
        approved: approvedCount,
        rejected: rejected.length,
        returned: returned.length,
      },
      stuck: {
        investigation_overdue: stuckInvestigation.length,
        approval_overdue: stuckApproval.length,
        open_cases: open.length,
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
