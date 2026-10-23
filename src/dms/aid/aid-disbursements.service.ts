import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../../users/user.entity";
import {
  AidApplicationStatus,
  AidDeliveryStatus,
  AidDisbursementMode,
  AidDisbursementRecipientType,
  AidDisbursementStatus,
} from "./aid.enums";
import {
  CreateAidDisbursementPlanDto,
  RecordAidDisbursementDeliveryDto,
  UpdateAidDisbursementStatusDto,
} from "./dto/aid.dto";
import { AidApplication } from "./entities/aid-application.entity";
import { AidDisbursement } from "./entities/aid-disbursement.entity";

const ELIGIBLE_APP_STATUSES = [
  AidApplicationStatus.SUCCESSFUL,
  AidApplicationStatus.DELIVERED,
];

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function addMonths(isoDate: Date, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(23, 59, 59, 999);
  return x;
}

@Injectable()
export class AidDisbursementsService {
  constructor(
    @InjectRepository(AidDisbursement)
    private readonly disbRepo: Repository<AidDisbursement>,
    @InjectRepository(AidApplication)
    private readonly appRepo: Repository<AidApplication>,
  ) {}

  /** Derive installment plan size + amounts from the approved application. */
  private planFromApplication(app: AidApplication): {
    total: number;
    amountEach: number;
    qtyEach: number;
    fundSource: string | null;
  } {
    const rec =
      (app.investigation_recommendation as Record<string, unknown>) || {};
    const totalAmount =
      toNum(rec.amount, 0) ||
      toNum(app.expected_amount, 0) ||
      toNum(app.expected_amount_max, 0);
    const months = Math.max(1, Math.min(36, Math.round(toNum(rec.period_months, 1))));
    const ration = (app.ration_details as Record<string, unknown>) || {};
    const packs = Math.max(
      0,
      Math.round(toNum(ration.persons ?? ration.packs ?? ration.quantity, 0)),
    );
    const total = packs > 1 ? packs : months > 1 ? months : 1;
    const amountEach = totalAmount > 0 ? Math.round((totalAmount / total) * 100) / 100 : 0;
    const qtyEach = packs > 1 ? 1 : 1;
    const fundSource =
      typeof rec.fund_source === "string"
        ? rec.fund_source
        : typeof rec.funding_source === "string"
          ? rec.funding_source
          : "Zakat";
    return { total, amountEach, qtyEach, fundSource };
  }

  private computeDisplayStatus(
    row: AidDisbursement,
  ): AidDisbursementStatus {
    if (
      row.status === AidDisbursementStatus.DELIVERED ||
      row.status === AidDisbursementStatus.AWAITING_VERIFICATION ||
      row.status === AidDisbursementStatus.ON_HOLD ||
      row.status === AidDisbursementStatus.CANCELLED
    ) {
      return row.status;
    }
    if (!row.due_at) return row.status || AidDisbursementStatus.QUEUED;
    const due = startOfDay(new Date(row.due_at));
    const today = startOfDay();
    if (due < today) return AidDisbursementStatus.OVERDUE;
    if (due <= endOfWeek()) return AidDisbursementStatus.DUE;
    return AidDisbursementStatus.QUEUED;
  }

  private serialize(row: AidDisbursement) {
    const app = row.application;
    const beneficiary = row.beneficiary || app?.beneficiary;
    const displayStatus = this.computeDisplayStatus(row);

    return {
      id: row.id,
      application_id: row.application_id,
      application_no: app?.application_no || null,
      beneficiary_person_id: row.beneficiary_person_id,
      beneficiary_name: beneficiary?.full_name || null,
      beneficiary_cnic: beneficiary?.cnic || null,
      beneficiary_phone: beneficiary?.phone || null,
      requested_aid_type: app?.requested_aid_type || null,
      aid_program: app?.aid_program || null,
      application_status: app?.status || null,
      installment_no: row.installment_no,
      total_installments: row.total_installments,
      installment_label: `${row.installment_no} of ${row.total_installments}`,
      planned_quantity: row.planned_quantity,
      delivered_quantity: row.delivered_quantity,
      planned_amount: row.planned_amount,
      delivered_amount: row.delivered_amount,
      due_at: row.due_at,
      status: displayStatus,
      stored_status: row.status,
      mode: row.mode,
      reference_no: row.reference_no,
      delivery_date: row.delivery_date,
      delivery_location: row.delivery_location,
      recipient_type: row.recipient_type,
      recipient_name: row.recipient_name,
      recipient_cnic: row.recipient_cnic,
      recipient_relation: row.recipient_relation,
      otp_verified: row.otp_verified,
      otp_phone: row.otp_phone,
      notes: row.notes,
      fund_source: row.fund_source,
      office_name: row.office_name,
      delivered_at: row.delivered_at,
      delivered_by_id: row.delivered_by_id,
      assigned_to_user_id: row.assigned_to_user_id,
      progress_pct: 0,
      delivered_installments_hint: 0,
      ceo_decided_by_id: app?.ceo_decided_by_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Create installment rows for an approved application if none exist yet.
   * Does not alter application status / existing delivery fields.
   */
  async ensurePlan(
    applicationId: number,
    user?: User,
    overrides?: Partial<CreateAidDisbursementPlanDto>,
  ) {
    const app = await this.appRepo.findOne({
      where: { id: applicationId, is_archived: false },
      relations: ["beneficiary"],
    });
    if (!app) throw new NotFoundException(`Application #${applicationId} not found`);
    if (!ELIGIBLE_APP_STATUSES.includes(app.status)) {
      throw new BadRequestException(
        "Disbursements can only be created after CEO approval (successful/delivered)",
      );
    }

    const existing = await this.disbRepo.count({
      where: { application_id: applicationId, is_archived: false },
    });
    if (existing > 0) {
      return this.findByApplication(applicationId);
    }

    const plan = this.planFromApplication(app);
    const total = Math.max(
      1,
      Math.min(36, overrides?.total_installments || plan.total),
    );
    const baseDate = app.ceo_decided_at || app.updated_at || new Date();
    const rows: AidDisbursement[] = [];
    for (let i = 1; i <= total; i++) {
      const due = addMonths(baseDate, i - 1);
      const row = this.disbRepo.create({
        application_id: app.id,
        beneficiary_person_id: app.beneficiary_person_id,
        installment_no: i,
        total_installments: total,
        planned_quantity: String(plan.qtyEach),
        planned_amount: plan.amountEach ? String(plan.amountEach) : null,
        due_at: due,
        status:
          i === 1 ? AidDisbursementStatus.DUE : AidDisbursementStatus.QUEUED,
        fund_source: overrides?.fund_source || plan.fundSource,
        office_name: overrides?.office_name || "Mian Channu head office",
        assigned_to_user_id: app.assigned_to_user_id,
        created_by: user || null,
        updated_by: user || null,
      });
      rows.push(row);
    }
    await this.disbRepo.save(rows);
    return this.findByApplication(applicationId);
  }

  async createPlan(dto: CreateAidDisbursementPlanDto, user?: User) {
    return this.ensurePlan(dto.application_id, user, dto);
  }

  async ensureEligiblePlans(user?: User) {
    const apps = await this.appRepo.find({
      where: {
        is_archived: false,
        status: In(ELIGIBLE_APP_STATUSES),
      },
      select: ["id"],
      take: 200,
      order: { id: "DESC" },
    });
    for (const app of apps) {
      const count = await this.disbRepo.count({
        where: { application_id: app.id, is_archived: false },
      });
      if (count === 0) {
        try {
          await this.ensurePlan(app.id, user);
        } catch {
          /* skip ineligible / race */
        }
      }
    }
  }

  async findAll(query: Record<string, string | undefined>, user?: User) {
    await this.ensureEligiblePlans(user);

    const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(query.pageSize || "20"), 10) || 20),
    );
    const sortField = [
      "due_at",
      "created_at",
      "updated_at",
      "installment_no",
      "id",
      "status",
    ].includes(String(query.sortField || ""))
      ? String(query.sortField)
      : "due_at";
    const sortOrder =
      String(query.sortOrder || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";

    const qb = this.disbRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.application", "app")
      .leftJoinAndSelect("d.beneficiary", "ben")
      .leftJoinAndSelect("app.beneficiary", "appBen")
      .where("d.is_archived = false")
      .andWhere("app.is_archived = false")
      .andWhere("app.status IN (:...statuses)", {
        statuses: ELIGIBLE_APP_STATUSES,
      });

    const search = String(query.search || "").trim();
    if (search) {
      qb.andWhere(
        `(app.application_no ILIKE :q OR ben.full_name ILIKE :q OR ben.cnic ILIKE :q OR appBen.full_name ILIKE :q OR appBen.cnic ILIKE :q)`,
        { q: `%${search}%` },
      );
    }

    if (query.requested_aid_type) {
      qb.andWhere("app.requested_aid_type = :rat", {
        rat: query.requested_aid_type,
      });
    }
    if (query.fund_source) {
      qb.andWhere("d.fund_source ILIKE :fs", {
        fs: `%${query.fund_source}%`,
      });
    }
    if (query.office_name) {
      qb.andWhere("d.office_name ILIKE :of", {
        of: `%${query.office_name}%`,
      });
    }
    if (query.assigned_to_user_id === "me" && user?.id) {
      qb.andWhere("d.assigned_to_user_id = :uid", { uid: user.id });
    } else if (query.assigned_to_user_id) {
      qb.andWhere("d.assigned_to_user_id = :uid", {
        uid: Number(query.assigned_to_user_id),
      });
    }
    if (query.application_id) {
      qb.andWhere("d.application_id = :aid", {
        aid: Number(query.application_id),
      });
    }

    const statusFilter = String(query.status || "").trim();
    // Status filters that are date-derived need post-filter; stored ones can filter in SQL
    if (
      statusFilter &&
      [
        AidDisbursementStatus.DELIVERED,
        AidDisbursementStatus.AWAITING_VERIFICATION,
        AidDisbursementStatus.ON_HOLD,
        AidDisbursementStatus.CANCELLED,
        AidDisbursementStatus.QUEUED,
      ].includes(statusFilter as AidDisbursementStatus)
    ) {
      qb.andWhere("d.status = :st", { st: statusFilter });
    }

    // Default queue: open installments (not fully closed)
    if (!statusFilter && query.queue !== "all") {
      qb.andWhere("d.status NOT IN (:...closed)", {
        closed: [
          AidDisbursementStatus.DELIVERED,
          AidDisbursementStatus.CANCELLED,
        ],
      });
    }

    qb.orderBy(`d.${sortField}`, sortOrder as "ASC" | "DESC");
    qb.addOrderBy("d.installment_no", "ASC");

    const all = await qb.getMany();
    const deliveredByApp = new Map<number, number>();
    for (const r of all) {
      if (r.status === AidDisbursementStatus.DELIVERED) {
        deliveredByApp.set(
          r.application_id,
          (deliveredByApp.get(r.application_id) || 0) + 1,
        );
      }
    }
    // Also count delivered siblings not in current result set
    const appIds = [...new Set(all.map((r) => r.application_id))];
    if (appIds.length) {
      const deliveredRows = await this.disbRepo.find({
        where: {
          application_id: In(appIds),
          status: AidDisbursementStatus.DELIVERED,
          is_archived: false,
        },
        select: ["application_id"],
      });
      deliveredByApp.clear();
      for (const r of deliveredRows) {
        deliveredByApp.set(
          r.application_id,
          (deliveredByApp.get(r.application_id) || 0) + 1,
        );
      }
    }

    let mapped = all.map((r) => {
      const s = this.serialize(r);
      const delivered = deliveredByApp.get(r.application_id) || 0;
      const total = Math.max(1, r.total_installments || 1);
      s.delivered_installments_hint = delivered;
      s.progress_pct = Math.round((delivered / total) * 100);
      return s;
    });

    if (statusFilter === AidDisbursementStatus.OVERDUE) {
      mapped = mapped.filter((r) => r.status === AidDisbursementStatus.OVERDUE);
    } else if (statusFilter === "due_this_week" || statusFilter === AidDisbursementStatus.DUE) {
      mapped = mapped.filter((r) => r.status === AidDisbursementStatus.DUE);
    } else if (statusFilter === "partially_delivered") {
      mapped = mapped.filter(
        (r) =>
          r.status !== AidDisbursementStatus.DELIVERED &&
          Number(r.delivered_installments_hint) > 0,
      );
    }

    const stage_counts = {
      overdue: 0,
      due_this_week: 0,
      partially_delivered: 0,
      awaiting_verification: 0,
    };
    for (const r of all.map((x) => this.serialize(x))) {
      if (r.status === AidDisbursementStatus.OVERDUE) stage_counts.overdue += 1;
      if (r.status === AidDisbursementStatus.DUE) stage_counts.due_this_week += 1;
      if (
        r.status !== AidDisbursementStatus.DELIVERED &&
        Number(r.delivered_installments_hint) > 0
      ) {
        stage_counts.partially_delivered += 1;
      }
      if (r.status === AidDisbursementStatus.AWAITING_VERIFICATION) {
        stage_counts.awaiting_verification += 1;
      }
    }

    const total = mapped.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const data = mapped.slice(start, start + pageSize);

    const offices = [
      ...new Set(
        all.map((r) => r.office_name).filter((x): x is string => !!x),
      ),
    ].sort();
    const fund_sources = [
      ...new Set(
        all.map((r) => r.fund_source).filter((x): x is string => !!x),
      ),
    ].sort();

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      stage_counts,
      filter_options: { offices, fund_sources },
    };
  }

  async findOne(id: number) {
    const row = await this.disbRepo.findOne({
      where: { id, is_archived: false },
      relations: ["application", "application.beneficiary", "beneficiary", "assigned_to"],
    });
    if (!row) throw new NotFoundException(`Disbursement #${id} not found`);

    const siblings = await this.disbRepo.find({
      where: { application_id: row.application_id, is_archived: false },
      order: { installment_no: "ASC" },
    });
    const delivered = siblings.filter(
      (s) => s.status === AidDisbursementStatus.DELIVERED,
    );
    const deliveredQty = delivered.reduce(
      (sum, s) => sum + toNum(s.delivered_quantity, toNum(s.planned_quantity, 0)),
      0,
    );
    const deliveredAmt = delivered.reduce(
      (sum, s) => sum + toNum(s.delivered_amount, toNum(s.planned_amount, 0)),
      0,
    );
    const approvedQty = siblings.reduce(
      (sum, s) => sum + toNum(s.planned_quantity, 0),
      0,
    );
    const approvedAmt = siblings.reduce(
      (sum, s) => sum + toNum(s.planned_amount, 0),
      0,
    );
    const remainingQty = Math.max(
      0,
      toNum(row.planned_quantity, 0) - toNum(row.delivered_quantity, 0),
    );

    const serialized = this.serialize(row);
    return {
      ...serialized,
      case_summary: {
        beneficiary: serialized.beneficiary_name,
        program: serialized.requested_aid_type,
        aid_program: serialized.aid_program,
        fund_source: serialized.fund_source,
        approved_quantity: approvedQty,
        approved_amount: approvedAmt,
        delivered_quantity: deliveredQty,
        delivered_amount: deliveredAmt,
        after_this_entry: `${Math.min(
          row.installment_no,
          row.total_installments,
        )} of ${row.total_installments}`,
        remaining_quantity: remainingQty,
        ceo_decided_by_id: row.application?.ceo_decided_by_id ?? null,
      },
      siblings: siblings.map((s) => ({
        id: s.id,
        installment_no: s.installment_no,
        status: this.computeDisplayStatus(s),
        due_at: s.due_at,
        planned_amount: s.planned_amount,
      })),
    };
  }

  async findByApplication(applicationId: number) {
    const rows = await this.disbRepo.find({
      where: { application_id: applicationId, is_archived: false },
      relations: ["application", "application.beneficiary", "beneficiary"],
      order: { installment_no: "ASC" },
    });
    return { data: rows.map((r) => this.serialize(r)) };
  }

  /**
   * Soft-sync application delivery_status from installment ledger.
   * Only touches delivery_* fields — never reopens rejected/draft apps.
   */
  private async syncApplicationDelivery(applicationId: number, user?: User) {
    const app = await this.appRepo.findOne({
      where: { id: applicationId, is_archived: false },
    });
    if (!app || !ELIGIBLE_APP_STATUSES.includes(app.status)) return;

    const rows = await this.disbRepo.find({
      where: { application_id: applicationId, is_archived: false },
    });
    if (!rows.length) return;

    const open = rows.filter(
      (r) =>
        r.status !== AidDisbursementStatus.DELIVERED &&
        r.status !== AidDisbursementStatus.CANCELLED,
    );
    const anyDelivered = rows.some(
      (r) => r.status === AidDisbursementStatus.DELIVERED,
    );

    if (open.length === 0) {
      app.delivery_status = AidDeliveryStatus.DELIVERED;
      app.status = AidApplicationStatus.DELIVERED;
      app.delivered_at = new Date();
      app.delivered_by_id = user?.id ?? app.delivered_by_id;
    } else if (anyDelivered) {
      app.delivery_status = AidDeliveryStatus.PARTIAL;
      if (app.status === AidApplicationStatus.DELIVERED) {
        app.status = AidApplicationStatus.SUCCESSFUL;
      }
    } else {
      app.delivery_status = AidDeliveryStatus.PENDING;
    }
    app.updated_by = user || null;
    await this.appRepo.save(app);
  }

  async recordDelivery(
    id: number,
    dto: RecordAidDisbursementDeliveryDto,
    user?: User,
  ) {
    const row = await this.disbRepo.findOne({
      where: { id, is_archived: false },
      relations: ["application"],
    });
    if (!row) throw new NotFoundException(`Disbursement #${id} not found`);
    if (
      row.status === AidDisbursementStatus.DELIVERED ||
      row.status === AidDisbursementStatus.CANCELLED
    ) {
      throw new BadRequestException("This installment is already closed");
    }

    const qty = toNum(dto.quantity, toNum(row.planned_quantity, 1));
    const maxQty = toNum(row.planned_quantity, qty);
    if (qty <= 0 || qty > maxQty + 0.0001) {
      throw new BadRequestException(
        `Quantity must be between 1 and ${maxQty} (remaining for this installment)`,
      );
    }
    if (!dto.mode) {
      throw new BadRequestException("Mode is required");
    }
    if (
      (dto.mode === AidDisbursementMode.IN_KIND_STORE ||
        dto.mode === AidDisbursementMode.LAB_VOUCHER ||
        dto.mode === AidDisbursementMode.CASH) &&
      !String(dto.reference_no || "").trim()
    ) {
      throw new BadRequestException(
        "Store issue / voucher / MR number is required for this mode",
      );
    }
    if (!dto.has_proof) {
      throw new BadRequestException("At least one proof upload is required");
    }

    row.delivered_quantity = String(qty);
    row.delivered_amount = String(
      toNum(dto.value, toNum(row.planned_amount, 0)),
    );
    row.mode = dto.mode;
    row.reference_no = dto.reference_no?.trim() || null;
    row.delivery_date = dto.delivery_date;
    row.delivery_location = dto.delivery_location.trim();
    row.recipient_type = dto.recipient_type;
    row.recipient_name = dto.recipient_name.trim();
    row.recipient_cnic = dto.recipient_cnic?.trim() || null;
    row.recipient_relation =
      dto.recipient_relation?.trim() ||
      (dto.recipient_type === AidDisbursementRecipientType.BENEFICIARY
        ? "Self"
        : null);
    row.otp_verified = !!dto.otp_verified;
    row.notes = dto.notes?.trim() || null;
    row.delivered_at = new Date();
    row.delivered_by_id = user?.id ?? null;
    row.updated_by = user || null;
    row.status = dto.submit_for_verification
      ? AidDisbursementStatus.AWAITING_VERIFICATION
      : AidDisbursementStatus.DELIVERED;

    await this.disbRepo.save(row);
    await this.syncApplicationDelivery(row.application_id, user);
    return this.findOne(id);
  }

  async updateStatus(
    id: number,
    dto: UpdateAidDisbursementStatusDto,
    user?: User,
  ) {
    const row = await this.disbRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) throw new NotFoundException(`Disbursement #${id} not found`);
    row.status = dto.status;
    if (dto.notes !== undefined) row.notes = dto.notes?.trim() || null;
    row.updated_by = user || null;
    await this.disbRepo.save(row);
    await this.syncApplicationDelivery(row.application_id, user);
    return this.findOne(id);
  }
}
