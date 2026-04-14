import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ProgramEntity } from '../program/programs/entities/program.entity';
import { ApplicationReport } from '../program/application_reports/entities/application-report.entity';
import { RationReport } from '../program/ration/reports/entities/ration-report.entity';
import { AreaRationReport } from '../program/area_ration/reports/entities/area-ration-report.entity';
import { EducationReport } from '../program/education/reports/entities/education-report.entity';
import { FinancialAssistanceReport } from '../program/financial_assistance/reports/entities/financial-assistance-report.entity';
import { MarriageGiftReport } from '../program/marriage_gifts/reports/entities/marriage-gift-report.entity';
import { KasbReport } from '../program/kasb/reports/entities/kasb-report.entity';
import { KasbTrainingReport } from '../program/kasb_training/reports/entities/kasb-training-report.entity';
import { SewingMachineReport } from '../program/sewing_machine/reports/entities/sewing-machine-report.entity';
import { TreePlantationReport } from '../program/tree_plantation/reports/entities/tree-plantation-report.entity';
import { WaterReport } from '../program/water/reports/entities/water-report.entity';
import { WheelChairOrCrutchesReport } from '../program/wheel_chair_or_crutches/reports/entities/wheel-chair-or-crutches-report.entity';
import { ProgramApplicationOverviewQueryDto } from './dto/program-application-overview-query.dto';
import { DeliverablesOverviewQueryDto } from './dto/deliverables-overview-query.dto';

/** Per active program: total “delivered” units in range (program-specific definition). */
export interface DeliverablesProgramRow {
  key: string;
  label: string;
  totalDelivered: number;
}

/** Cross-program rollup for one vulnerability dimension. */
export interface DeliverablesVulnerabilityRow {
  key: string;
  label: string;
  total: number;
}

/** One line on a per-program vulnerability mini-card (only categories that exist for that program’s reports). */
export interface DeliverablesProgramVulnerabilityLine {
  key: string;
  label: string;
  count: number;
}

/** Per-program carousel card: vulnerability breakdown for that program’s underlying report table(s). */
export interface DeliverablesProgramVulnerabilityCard {
  key: string;
  label: string;
  /** Same as `programsList[].totalDelivered` for this program. */
  totalDelivered: number;
  lines: DeliverablesProgramVulnerabilityLine[];
  /** Sum of `lines[].count` (only non-zero categories are listed). */
  vulnerabilitiesTotal: number;
}

export interface DeliverablesOverallPayload {
  from?: string;
  to?: string;
  programsList: DeliverablesProgramRow[];
  vulnerabilities: DeliverablesVulnerabilityRow[];
  /** Sum of delivered units across all programs in `programsList` (same as summing `totalDelivered`). */
  totalDeliveredAllPrograms: number;
  /** Sum of all vulnerability rollup totals in `vulnerabilities`. */
  totalVulnerabilitiesAll: number;
  /** One entry per active applicationable program; scrollable mini-cards on the client. */
  programVulnerabilityCards: DeliverablesProgramVulnerabilityCard[];
}

/** Card shape aligned with `department_daily_report` program_application_card / dummyData.js */
export interface ProgramApplicationOverviewCard {
  id: string;
  name: string;
  icon: string;
  accent: string;
  accentSoft: string;
  total: number;
  approvalRate: number;
  /** Sum of `investigation_count` per program / overall */
  investigated: number;
  verified: number;
  approved: number;
  rejected: number;
  pendingTotal?: number;
  isOverall?: boolean;
}

const PROGRAM_CARD_STYLE_BY_KEY: Record<
  string,
  { icon: string; accent: string; accentSoft: string }
> = {
  food_security: { icon: 'bag', accent: '#16a34a', accentSoft: '#dcfce7' },
  community_services: { icon: 'users', accent: '#7c3aed', accentSoft: '#ede9fe' },
  widows_and_orphans_care_program: { icon: 'heart', accent: '#ea580c', accentSoft: '#ffedd5' },
  education: { icon: 'book', accent: '#2563eb', accentSoft: '#dbeafe' },
  water_clean_water: { icon: 'droplet', accent: '#0891b2', accentSoft: '#cffafe' },
  kasb: { icon: 'tool', accent: '#4f46e5', accentSoft: '#e0e7ff' },
  livelihood_support_program: { icon: 'tool', accent: '#0d9488', accentSoft: '#ccfbf1' },
  green_initiative: { icon: 'bag', accent: '#15803d', accentSoft: '#dcfce7' },
  disaster_management: { icon: 'heart', accent: '#be123c', accentSoft: '#ffe4e6' },
};

function defaultStyleForProgramKey(key: string): { icon: string; accent: string; accentSoft: string } {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return {
    icon: 'tool',
    accent: `hsl(${hue} 45% 40%)`,
    accentSoft: `hsl(${hue} 40% 92%)`,
  };
}

function roundRate(approved: number, total: number): number {
  if (!total || total <= 0) {
    return 0;
  }
  return Math.round((approved / total) * 1000) / 10;
}

function applyReportDateFilter(
  qb: SelectQueryBuilder<ApplicationReport>,
  alias: string,
  from?: string,
  to?: string,
): void {
  if (from && to) {
    qb.andWhere(`${alias}.report_date BETWEEN :from AND :to`, { from, to });
  } else if (from) {
    qb.andWhere(`${alias}.report_date >= :from`, { from });
  } else if (to) {
    qb.andWhere(`${alias}.report_date <= :to`, { to });
  }
}

function applyDeliverablesDateFilter(
  qb: SelectQueryBuilder<any>,
  alias: string,
  dateColumn: 'report_date' | 'date',
  from?: string,
  to?: string,
): void {
  const col = `${alias}.${dateColumn}`;
  if (from && to) {
    qb.andWhere(`${col} BETWEEN :from AND :to`, { from, to });
  } else if (from) {
    qb.andWhere(`${col} >= :from`, { from });
  } else if (to) {
    qb.andWhere(`${col} <= :to`, { to });
  }
}

@Injectable()
export class NewDashboardService {
  constructor(
    @InjectRepository(ProgramEntity)
    private readonly programRepository: Repository<ProgramEntity>,
    @InjectRepository(ApplicationReport)
    private readonly applicationReportRepository: Repository<ApplicationReport>,
    @InjectRepository(RationReport)
    private readonly rationReportRepository: Repository<RationReport>,
    @InjectRepository(AreaRationReport)
    private readonly areaRationReportRepository: Repository<AreaRationReport>,
    @InjectRepository(EducationReport)
    private readonly educationReportRepository: Repository<EducationReport>,
    @InjectRepository(FinancialAssistanceReport)
    private readonly financialAssistanceReportRepository: Repository<FinancialAssistanceReport>,
    @InjectRepository(MarriageGiftReport)
    private readonly marriageGiftReportRepository: Repository<MarriageGiftReport>,
    @InjectRepository(KasbReport)
    private readonly kasbReportRepository: Repository<KasbReport>,
    @InjectRepository(KasbTrainingReport)
    private readonly kasbTrainingReportRepository: Repository<KasbTrainingReport>,
    @InjectRepository(SewingMachineReport)
    private readonly sewingMachineReportRepository: Repository<SewingMachineReport>,
    @InjectRepository(TreePlantationReport)
    private readonly treePlantationReportRepository: Repository<TreePlantationReport>,
    @InjectRepository(WaterReport)
    private readonly waterReportRepository: Repository<WaterReport>,
    @InjectRepository(WheelChairOrCrutchesReport)
    private readonly wheelChairOrCrutchesReportRepository: Repository<WheelChairOrCrutchesReport>,
  ) {}

  /**
   * Active programs (ordered by id) + aggregated application report metrics per program key.
   * First card is **Overall** (all projects); following cards match active programs (zeros if no rows).
   */
  async getProgramApplicationOverview(
    query: ProgramApplicationOverviewQueryDto,
  ): Promise<{ data: ProgramApplicationOverviewCard[] }> {
    const { from, to } = query;

    const overallRow = await this.buildOverallTotals(from, to);
    const byProject = await this.aggregateByProject(from, to);

    const activePrograms = await this.programRepository.find({
      where: { is_archived: false, status: 'active', applicationable: true },
      order: { id: 'ASC' },
    });

    const overallCard: ProgramApplicationOverviewCard = {
      id: 'overall',
      name: 'Overall',
      icon: 'layers',
      accent: '#1e293b',
      accentSoft: '#e2e8f0',
      total: overallRow.application_count,
      approvalRate: roundRate(overallRow.approved, overallRow.application_count),
      investigated: overallRow.investigated,
      verified: overallRow.verified,
      approved: overallRow.approved,
      rejected: overallRow.rejected,
      pendingTotal: overallRow.pending,
      isOverall: true,
    };

    const programCards: ProgramApplicationOverviewCard[] = activePrograms.map((p) => {
      const agg = byProject.get(p.key) ?? {
        application_count: 0,
        investigated: 0,
        verified: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
      };
      const style = PROGRAM_CARD_STYLE_BY_KEY[p.key] ?? defaultStyleForProgramKey(p.key);
      return {
        id: p.key,
        name: p.label,
        ...style,
        total: agg.application_count,
        approvalRate: roundRate(agg.approved, agg.application_count),
        investigated: agg.investigated,
        verified: agg.verified,
        approved: agg.approved,
        rejected: agg.rejected,
      };
    });

    return { data: [overallCard, ...programCards] };
  }

  private async buildOverallTotals(
    from?: string,
    to?: string,
  ): Promise<{
    application_count: number;
    investigated: number;
    verified: number;
    approved: number;
    rejected: number;
    pending: number;
  }> {
    const qb = this.applicationReportRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.application_count), 0)', 'application_count')
      .addSelect('COALESCE(SUM(r.investigation_count), 0)', 'investigated')
      .addSelect('COALESCE(SUM(r.verified_count), 0)', 'verified')
      .addSelect('COALESCE(SUM(r.approved_count), 0)', 'approved')
      .addSelect('COALESCE(SUM(r.rejected_count), 0)', 'rejected')
      .addSelect('COALESCE(SUM(r.pending_count), 0)', 'pending')
      .where('r.is_archived = false');

    applyReportDateFilter(qb, 'r', from, to);

    const raw = await qb.getRawOne<{
      application_count: string;
      investigated: string;
      verified: string;
      approved: string;
      rejected: string;
      pending: string;
    }>();

    return {
      application_count: Number(raw?.application_count ?? 0),
      investigated: Number(raw?.investigated ?? 0),
      verified: Number(raw?.verified ?? 0),
      approved: Number(raw?.approved ?? 0),
      rejected: Number(raw?.rejected ?? 0),
      pending: Number(raw?.pending ?? 0),
    };
  }

  private async aggregateByProject(
    from?: string,
    to?: string,
  ): Promise<
    Map<
      string,
      {
        application_count: number;
        investigated: number;
        verified: number;
        approved: number;
        rejected: number;
        pending: number;
      }
    >
  > {
    const qb = this.applicationReportRepository
      .createQueryBuilder('r')
      .select('r.project', 'project')
      .addSelect('COALESCE(SUM(r.application_count), 0)', 'application_count')
      .addSelect('COALESCE(SUM(r.investigation_count), 0)', 'investigated')
      .addSelect('COALESCE(SUM(r.verified_count), 0)', 'verified')
      .addSelect('COALESCE(SUM(r.approved_count), 0)', 'approved')
      .addSelect('COALESCE(SUM(r.rejected_count), 0)', 'rejected')
      .addSelect('COALESCE(SUM(r.pending_count), 0)', 'pending')
      .where('r.is_archived = false')
      .groupBy('r.project');

    applyReportDateFilter(qb, 'r', from, to);

    const rows = await qb.getRawMany<{
      project: string;
      application_count: string;
      investigated: string;
      verified: string;
      approved: string;
      rejected: string;
      pending: string;
    }>();

    const map = new Map<
      string,
      {
        application_count: number;
        investigated: number;
        verified: number;
        approved: number;
        rejected: number;
        pending: number;
      }
    >();
    for (const row of rows) {
      if (!row.project) {
        continue;
      }
      map.set(row.project, {
        application_count: Number(row.application_count),
        investigated: Number(row.investigated),
        verified: Number(row.verified),
        approved: Number(row.approved),
        rejected: Number(row.rejected),
        pending: Number(row.pending),
      });
    }
    return map;
  }

  /**
   * First “overall” card for Deliverables-by-program UX: program totals + global vulnerability rollups.
   * Date filters apply to each underlying report table (`report_date` or `date`).
   */
  async getDeliverablesOverallCard(
    query: DeliverablesOverviewQueryDto,
  ): Promise<DeliverablesOverallPayload> {
    const { from, to } = query;

    const programs = await this.programRepository.find({
      where: { is_archived: false, status: 'active', applicationable: true },
      order: { id: 'ASC' },
    });

    const programsList: DeliverablesProgramRow[] = [];
    const programVulnerabilityCards: DeliverablesProgramVulnerabilityCard[] = [];

    for (const p of programs) {
      const totalDelivered = await this.sumDeliveredForProgramKey(p.key, from, to);
      programsList.push({ key: p.key, label: p.label, totalDelivered });
      const breakdown = await this.vulnerabilityBreakdownForProgramKey(p.key, from, to);
      const lines = this.vulnerabilityBreakdownToLines(breakdown);
      const vulnerabilitiesTotal = lines.reduce((s, l) => s + l.count, 0);
      programVulnerabilityCards.push({
        key: p.key,
        label: p.label,
        totalDelivered,
        lines,
        vulnerabilitiesTotal,
      });
    }

    const vulnerabilities = await this.buildDeliverablesVulnerabilityTotals(from, to);
    const totalDeliveredAllPrograms = programsList.reduce((s, r) => s + r.totalDelivered, 0);
    const totalVulnerabilitiesAll = vulnerabilities.reduce((s, r) => s + r.total, 0);

    return {
      from,
      to,
      programsList,
      vulnerabilities,
      totalDeliveredAllPrograms,
      totalVulnerabilitiesAll,
      programVulnerabilityCards,
    };
  }

  /**
   * Raw vulnerability counts for one program’s report model (zeros where the schema has no column).
   */
  private async vulnerabilityBreakdownForProgramKey(
    programKey: string,
    from?: string,
    to?: string,
  ): Promise<{
    widows: number;
    orphans: number;
    divorced: number;
    disable: number;
    indegent: number;
    extremePoor: number;
  }> {
    switch (programKey) {
      case 'food_security': {
        const [widows, orphans, divorced, disable, indegent] = await Promise.all([
          this.sumRationWidows(from, to),
          this.sumRationOrphans(from, to),
          this.sumRationDivorced(from, to),
          this.sumRationDisable(from, to),
          this.sumRationIndegent(from, to),
        ]);
        return { widows, orphans, divorced, disable, indegent, extremePoor: 0 };
      }
      case 'community_services': {
        const [orphans, divorced, disable, indegent] = await Promise.all([
          this.sumMarriageOrphans(from, to),
          this.sumMarriageDivorced(from, to),
          this.sumMarriageDisable(from, to),
          this.sumMarriageIndegent(from, to),
        ]);
        return { widows: 0, orphans, divorced, disable, indegent, extremePoor: 0 };
      }
      case 'education': {
        const [orphans, divorced, disable, indegent] = await Promise.all([
          this.sumEducationOrphans(from, to),
          this.sumEducationDivorced(from, to),
          this.sumEducationDisable(from, to),
          this.sumEducationIndegent(from, to),
        ]);
        return { widows: 0, orphans, divorced, disable, indegent, extremePoor: 0 };
      }
      case 'widows_and_orphans_care_program': {
        const [widows, divorced, disable, extremePoor] = await Promise.all([
          this.sumFinancialWidow(from, to),
          this.sumFinancialDivorced(from, to),
          this.sumFinancialDisable(from, to),
          this.sumFinancialExtremePoor(from, to),
        ]);
        return { widows, orphans: 0, divorced, disable, indegent: 0, extremePoor };
      }
      case 'livelihood_support_program': {
        const [orphans, divorced, disable, indegent] = await Promise.all([
          this.sumSewingOrphans(from, to),
          this.sumSewingDivorced(from, to),
          this.sumSewingDisable(from, to),
          this.sumSewingIndegent(from, to),
        ]);
        return { widows: 0, orphans, divorced, disable, indegent, extremePoor: 0 };
      }
      case 'disaster_management': {
        const [orphans, divorced, disable, indegent] = await Promise.all([
          this.sumWheelOrphans(from, to),
          this.sumWheelDivorced(from, to),
          this.sumWheelDisable(from, to),
          this.sumWheelIndegent(from, to),
        ]);
        return { widows: 0, orphans, divorced, disable, indegent, extremePoor: 0 };
      }
      default:
        return {
          widows: 0,
          orphans: 0,
          divorced: 0,
          disable: 0,
          indegent: 0,
          extremePoor: 0,
        };
    }
  }

  private vulnerabilityBreakdownToLines(b: {
    widows: number;
    orphans: number;
    divorced: number;
    disable: number;
    indegent: number;
    extremePoor: number;
  }): DeliverablesProgramVulnerabilityLine[] {
    const defs: { key: string; label: string; count: number }[] = [
      { key: 'widows', label: 'Widows', count: b.widows },
      { key: 'orphans', label: 'Orphans', count: b.orphans },
      { key: 'divorced', label: 'Divorced', count: b.divorced },
      { key: 'disable', label: 'Disable', count: b.disable },
      { key: 'indegent', label: 'Indegent', count: b.indegent },
      { key: 'extreme_poor', label: 'Extreme poor', count: b.extremePoor },
    ];
    return defs.filter((d) => d.count > 0).map((d) => ({ key: d.key, label: d.label, count: d.count }));
  }

  private async sumDeliveredForProgramKey(
    programKey: string,
    from?: string,
    to?: string,
  ): Promise<number> {
    switch (programKey) {
      case 'food_security':
        return this.sumRationTotalDelivered(from, to);
      case 'area_ration':
        return this.sumScalar(
          this.areaRationReportRepository,
          'r',
          'report_date',
          'COALESCE(SUM(r.quantity), 0)',
          from,
          to,
        );
      case 'community_services':
        return this.sumMarriageTotal(from, to);
      case 'education':
        return this.sumEducationTotal(from, to);
      case 'water_clean_water':
        return this.sumScalar(
          this.waterReportRepository,
          'w',
          'date',
          'COALESCE(SUM(w.quantity), 0)',
          from,
          to,
        );
      case 'kasb':
        return this.sumScalar(
          this.kasbReportRepository,
          'k',
          'date',
          'COALESCE(SUM(k.delivery), 0)',
          from,
          to,
        );
      case 'kasb_training':
        return this.sumScalar(
          this.kasbTrainingReportRepository,
          't',
          'date',
          'COALESCE(SUM(t.total), 0)',
          from,
          to,
        );
      case 'green_initiative':
        return this.sumScalar(
          this.treePlantationReportRepository,
          'tr',
          'report_date',
          'COALESCE(SUM(tr.plants), 0)',
          from,
          to,
        );
      case 'widows_and_orphans_care_program':
        return this.sumFinancialTotal(from, to);
      case 'livelihood_support_program':
        return this.sumSewingTotal(from, to);
      case 'disaster_management':
        return this.sumWheelTotal(from, to);
      default:
        return 0;
    }
  }

  private async sumScalar(
    repo: Repository<any>,
    alias: string,
    dateColumn: 'report_date' | 'date',
    selectSql: string,
    from?: string,
    to?: string,
  ): Promise<number> {
    const qb = repo.createQueryBuilder(alias).select(selectSql, 'v').where(`${alias}.is_archived = false`);
    applyDeliverablesDateFilter(qb, alias, dateColumn, from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async sumRationTotalDelivered(from?: string, to?: string): Promise<number> {
    const qb = this.rationReportRepository
      .createQueryBuilder('r')
      .select(
        'COALESCE(SUM(r.full_widows + r.half_widows + r.full_divorced + r.half_divorced + r.full_disable + r.half_disable + r.full_indegent + r.half_indegent + r.full_orphan + r.half_orphan + r.life_time), 0)',
        'v',
      )
      .where('r.is_archived = false');
    applyDeliverablesDateFilter(qb, 'r', 'report_date', from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async sumMarriageTotal(from?: string, to?: string): Promise<number> {
    const qb = this.marriageGiftReportRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.orphans + m.divorced + m.disable + m.indegent), 0)', 'v')
      .where('m.is_archived = false');
    applyDeliverablesDateFilter(qb, 'm', 'report_date', from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async sumEducationTotal(from?: string, to?: string): Promise<number> {
    const qb = this.educationReportRepository
      .createQueryBuilder('e')
      .select(
        'COALESCE(SUM(e.male_orphans + e.male_divorced + e.male_disable + e.male_indegent + e.female_orphans + e.female_divorced + e.female_disable + e.female_indegent), 0)',
        'v',
      )
      .where('e.is_archived = false');
    applyDeliverablesDateFilter(qb, 'e', 'date', from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async sumFinancialTotal(from?: string, to?: string): Promise<number> {
    const qb = this.financialAssistanceReportRepository
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.widow + f.divorced + f.disable + f.extreme_poor), 0)', 'v')
      .where('f.is_archived = false');
    applyDeliverablesDateFilter(qb, 'f', 'report_date', from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async sumSewingTotal(from?: string, to?: string): Promise<number> {
    const qb = this.sewingMachineReportRepository
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.orphans + s.divorced + s.disable + s.indegent), 0)', 'v')
      .where('s.is_archived = false');
    applyDeliverablesDateFilter(qb, 's', 'date', from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async sumWheelTotal(from?: string, to?: string): Promise<number> {
    const qb = this.wheelChairOrCrutchesReportRepository
      .createQueryBuilder('w')
      .select('COALESCE(SUM(w.orphans + w.divorced + w.disable + w.indegent), 0)', 'v')
      .where('w.is_archived = false');
    applyDeliverablesDateFilter(qb, 'w', 'date', from, to);
    const raw = await qb.getRawOne<{ v: string }>();
    return Number(raw?.v ?? 0);
  }

  private async buildDeliverablesVulnerabilityTotals(
    from?: string,
    to?: string,
  ): Promise<DeliverablesVulnerabilityRow[]> {
    const widows =
      (await this.sumRationWidows(from, to)) + (await this.sumFinancialWidow(from, to));
    const orphans =
      (await this.sumRationOrphans(from, to)) +
      (await this.sumMarriageOrphans(from, to)) +
      (await this.sumSewingOrphans(from, to)) +
      (await this.sumEducationOrphans(from, to)) +
      (await this.sumWheelOrphans(from, to));
    const divorced =
      (await this.sumRationDivorced(from, to)) +
      (await this.sumMarriageDivorced(from, to)) +
      (await this.sumSewingDivorced(from, to)) +
      (await this.sumEducationDivorced(from, to)) +
      (await this.sumFinancialDivorced(from, to)) +
      (await this.sumWheelDivorced(from, to));
    const disable =
      (await this.sumRationDisable(from, to)) +
      (await this.sumMarriageDisable(from, to)) +
      (await this.sumSewingDisable(from, to)) +
      (await this.sumEducationDisable(from, to)) +
      (await this.sumFinancialDisable(from, to)) +
      (await this.sumWheelDisable(from, to));
    const indegent =
      (await this.sumRationIndegent(from, to)) +
      (await this.sumMarriageIndegent(from, to)) +
      (await this.sumSewingIndegent(from, to)) +
      (await this.sumEducationIndegent(from, to)) +
      (await this.sumWheelIndegent(from, to));
    const extremePoor = await this.sumFinancialExtremePoor(from, to);

    return [
      { key: 'widows', label: 'Widows', total: widows },
      { key: 'orphans', label: 'Orphans', total: orphans },
      { key: 'divorced', label: 'Divorced', total: divorced },
      { key: 'disable', label: 'Disable', total: disable },
      { key: 'indegent', label: 'Indegent', total: indegent },
      { key: 'extreme_poor', label: 'Extreme poor', total: extremePoor },
    ];
  }

  private async sumRationWidows(from?: string, to?: string): Promise<number> {
    const qb = this.rationReportRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.full_widows + r.half_widows), 0)', 'v')
      .where('r.is_archived = false');
    applyDeliverablesDateFilter(qb, 'r', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumRationOrphans(from?: string, to?: string): Promise<number> {
    const qb = this.rationReportRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.full_orphan + r.half_orphan), 0)', 'v')
      .where('r.is_archived = false');
    applyDeliverablesDateFilter(qb, 'r', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumRationDivorced(from?: string, to?: string): Promise<number> {
    const qb = this.rationReportRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.full_divorced + r.half_divorced), 0)', 'v')
      .where('r.is_archived = false');
    applyDeliverablesDateFilter(qb, 'r', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumRationDisable(from?: string, to?: string): Promise<number> {
    const qb = this.rationReportRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.full_disable + r.half_disable), 0)', 'v')
      .where('r.is_archived = false');
    applyDeliverablesDateFilter(qb, 'r', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumRationIndegent(from?: string, to?: string): Promise<number> {
    const qb = this.rationReportRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.full_indegent + r.half_indegent), 0)', 'v')
      .where('r.is_archived = false');
    applyDeliverablesDateFilter(qb, 'r', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumFinancialWidow(from?: string, to?: string): Promise<number> {
    const qb = this.financialAssistanceReportRepository
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.widow), 0)', 'v')
      .where('f.is_archived = false');
    applyDeliverablesDateFilter(qb, 'f', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumFinancialDivorced(from?: string, to?: string): Promise<number> {
    const qb = this.financialAssistanceReportRepository
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.divorced), 0)', 'v')
      .where('f.is_archived = false');
    applyDeliverablesDateFilter(qb, 'f', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumFinancialDisable(from?: string, to?: string): Promise<number> {
    const qb = this.financialAssistanceReportRepository
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.disable), 0)', 'v')
      .where('f.is_archived = false');
    applyDeliverablesDateFilter(qb, 'f', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumFinancialExtremePoor(from?: string, to?: string): Promise<number> {
    const qb = this.financialAssistanceReportRepository
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.extreme_poor), 0)', 'v')
      .where('f.is_archived = false');
    applyDeliverablesDateFilter(qb, 'f', 'report_date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumMarriageOrphans(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.marriageGiftReportRepository, 'm', 'report_date', 'm.orphans', from, to);
  }

  private async sumMarriageDivorced(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.marriageGiftReportRepository, 'm', 'report_date', 'm.divorced', from, to);
  }

  private async sumMarriageDisable(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.marriageGiftReportRepository, 'm', 'report_date', 'm.disable', from, to);
  }

  private async sumMarriageIndegent(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.marriageGiftReportRepository, 'm', 'report_date', 'm.indegent', from, to);
  }

  private async sumSewingOrphans(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.sewingMachineReportRepository, 's', 'date', 's.orphans', from, to);
  }

  private async sumSewingDivorced(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.sewingMachineReportRepository, 's', 'date', 's.divorced', from, to);
  }

  private async sumSewingDisable(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.sewingMachineReportRepository, 's', 'date', 's.disable', from, to);
  }

  private async sumSewingIndegent(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.sewingMachineReportRepository, 's', 'date', 's.indegent', from, to);
  }

  private async sumEducationOrphans(from?: string, to?: string): Promise<number> {
    const qb = this.educationReportRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.male_orphans + e.female_orphans), 0)', 'v')
      .where('e.is_archived = false');
    applyDeliverablesDateFilter(qb, 'e', 'date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumEducationDivorced(from?: string, to?: string): Promise<number> {
    const qb = this.educationReportRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.male_divorced + e.female_divorced), 0)', 'v')
      .where('e.is_archived = false');
    applyDeliverablesDateFilter(qb, 'e', 'date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumEducationDisable(from?: string, to?: string): Promise<number> {
    const qb = this.educationReportRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.male_disable + e.female_disable), 0)', 'v')
      .where('e.is_archived = false');
    applyDeliverablesDateFilter(qb, 'e', 'date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumEducationIndegent(from?: string, to?: string): Promise<number> {
    const qb = this.educationReportRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.male_indegent + e.female_indegent), 0)', 'v')
      .where('e.is_archived = false');
    applyDeliverablesDateFilter(qb, 'e', 'date', from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }

  private async sumWheelOrphans(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.wheelChairOrCrutchesReportRepository, 'w', 'date', 'w.orphans', from, to);
  }

  private async sumWheelDivorced(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.wheelChairOrCrutchesReportRepository, 'w', 'date', 'w.divorced', from, to);
  }

  private async sumWheelDisable(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.wheelChairOrCrutchesReportRepository, 'w', 'date', 'w.disable', from, to);
  }

  private async sumWheelIndegent(from?: string, to?: string): Promise<number> {
    return this.sumColumn(this.wheelChairOrCrutchesReportRepository, 'w', 'date', 'w.indegent', from, to);
  }

  private async sumColumn(
    repo: Repository<any>,
    alias: string,
    dateColumn: 'report_date' | 'date',
    columnExpr: string,
    from?: string,
    to?: string,
  ): Promise<number> {
    const qb = repo
      .createQueryBuilder(alias)
      .select(`COALESCE(SUM(${columnExpr}), 0)`, 'v')
      .where(`${alias}.is_archived = false`);
    applyDeliverablesDateFilter(qb, alias, dateColumn, from, to);
    return Number((await qb.getRawOne<{ v: string }>())?.v ?? 0);
  }
}
