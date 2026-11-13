import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../../users/user.entity";
import { AidApplication } from "../entities/aid-application.entity";
import { AidApplicationStatus } from "../aid.enums";
import { AidApplicationAuditLog } from "./entities/aid-application-audit-log.entity";
import { LogAidAuditParams } from "./aid-audit.types";
import { AID_AUDIT_SOURCE } from "./aid-audit.constants";

export type AidAuditHistoryEntry = {
  id: number;
  application_id: number | null;
  application_no: string | null;
  action: string;
  source: string;
  changes: LogAidAuditParams["changes"];
  performed_by_id: number | null;
  performed_by: {
    id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

@Injectable()
export class AidAuditService {
  private readonly logger = new Logger(AidAuditService.name);

  constructor(
    @InjectRepository(AidApplicationAuditLog)
    private readonly auditRepo: Repository<AidApplicationAuditLog>,
    @InjectRepository(AidApplication)
    private readonly appRepo: Repository<AidApplication>,
  ) {}

  /**
   * Append-only audit row. Never throws — Aid mutations must not fail if logging fails.
   */
  async log(params: LogAidAuditParams): Promise<void> {
    if (!params.changes?.length && !params.metadata) return;
    const changes = params.changes?.length
      ? params.changes
      : [
          {
            field: "record",
            old_value: null,
            new_value: params.action,
          },
        ];

    try {
      const row = this.auditRepo.create({
        application_id: params.applicationId,
        application_no: params.applicationNo ?? null,
        action: params.action,
        source: params.source || AID_AUDIT_SOURCE.STAFF_UI,
        changes,
        performed_by_id: params.performedByUserId ?? null,
        metadata: params.metadata ?? null,
      });
      await this.auditRepo.save(row);
    } catch (err: any) {
      this.logger.warn(
        `Aid audit log failed [app=${params.applicationId}, action=${params.action}]: ${err?.message || err}`,
      );
    }
  }

  async findByApplicationId(
    applicationId: number,
  ): Promise<AidAuditHistoryEntry[]> {
    const rows = await this.auditRepo.find({
      where: { application_id: applicationId },
      relations: ["performed_by"],
      order: { created_at: "DESC", id: "DESC" },
    });

    return rows.map((row) => ({
      id: row.id,
      application_id: row.application_id,
      application_no: row.application_no,
      action: row.action,
      source: row.source,
      changes: row.changes ?? [],
      performed_by_id: row.performed_by_id,
      performed_by: row.performed_by
        ? {
            id: row.performed_by.id,
            email: row.performed_by.email ?? null,
            first_name: row.performed_by.first_name ?? null,
            last_name: row.performed_by.last_name ?? null,
          }
        : null,
      metadata: row.metadata,
      created_at: row.created_at,
    }));
  }

  async getApplicationSummary(applicationId: number) {
    const app = await this.appRepo.findOne({
      where: { id: applicationId, is_archived: false },
      relations: ["beneficiary", "assigned_to", "verified_by", "ceo_decided_by"],
    });
    if (!app) {
      throw new NotFoundException(`Application #${applicationId} not found`);
    }
    return {
      id: app.id,
      application_no: app.application_no,
      status: app.status,
      requested_aid_type: app.requested_aid_type,
      aid_program: app.aid_program,
      title: app.title,
      assigned_to: app.assigned_to
        ? {
            id: app.assigned_to.id,
            email: app.assigned_to.email,
            first_name: (app.assigned_to as any).first_name ?? null,
            last_name: (app.assigned_to as any).last_name ?? null,
          }
        : null,
      beneficiary: app.beneficiary
        ? {
            id: app.beneficiary.id,
            full_name: app.beneficiary.full_name,
            cnic: app.beneficiary.cnic,
          }
        : null,
      verified_at: app.verified_at,
      verified_by: app.verified_by
        ? {
            id: app.verified_by.id,
            email: app.verified_by.email,
            first_name: (app.verified_by as any).first_name ?? null,
            last_name: (app.verified_by as any).last_name ?? null,
          }
        : null,
      ceo_decided_at: app.ceo_decided_at,
      created_at: app.created_at,
      updated_at: app.updated_at,
    };
  }

  /**
   * Full interaction report for one user — audit log rows they performed,
   * optionally scoped by application filters + audit created_at date window.
   */
  async findUserInteractions(params: {
    user_id: number | string;
    search?: string;
    status?: string;
    stage?: string;
    requested_aid_type?: string;
    district?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    pageSize?: number;
  }) {
    const userId = Number(params.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BadRequestException("user_id is required");
    }

    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));

    const qb = this.auditRepo
      .createQueryBuilder("aal")
      .leftJoinAndSelect("aal.performed_by", "performed_by")
      .leftJoinAndSelect("aal.application", "a")
      .leftJoinAndSelect("a.beneficiary", "beneficiary")
      .where("aal.performed_by_id = :userId", { userId })
      .orderBy("aal.created_at", "DESC")
      .addOrderBy("aal.id", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const search = String(params.search || "").trim();
    if (search) {
      qb.andWhere(
        "(aal.application_no ILIKE :q OR a.application_no ILIKE :q OR a.title ILIKE :q OR beneficiary.full_name ILIKE :q OR beneficiary.cnic ILIKE :q)",
        { q: `%${search}%` },
      );
    }

    const aidType = String(params.requested_aid_type || "").trim();
    if (aidType) {
      qb.andWhere("a.requested_aid_type = :aidType", { aidType });
    }

    const district = String(params.district || "").trim();
    if (district) {
      qb.andWhere("beneficiary.district ILIKE :district", {
        district: `%${district}%`,
      });
    }

    const stage = String(params.stage || "").trim().toLowerCase();
    const status = String(params.status || "").trim();
    if (stage) {
      this.applyStageFilterToAlias(qb, stage, "a");
    } else if (status) {
      qb.andWhere("a.status = :status", { status });
    }

    const day = String(params.date || "").trim();
    const startDate = String(params.start_date || "").trim();
    const endDate = String(params.end_date || "").trim();
    if (day) {
      qb.andWhere("aal.created_at >= :dayStart AND aal.created_at <= :dayEnd", {
        dayStart: `${day} 00:00:00`,
        dayEnd: `${day} 23:59:59.999`,
      });
    } else {
      if (startDate) {
        qb.andWhere("aal.created_at >= :listStart", {
          listStart: `${startDate} 00:00:00`,
        });
      }
      if (endDate) {
        qb.andWhere("aal.created_at <= :listEnd", {
          listEnd: `${endDate} 23:59:59.999`,
        });
      }
    }

    const [rows, total] = await qb.getManyAndCount();

    const summaryQb = this.auditRepo
      .createQueryBuilder("aal")
      .leftJoin("aal.application", "a")
      .leftJoin("a.beneficiary", "beneficiary")
      .where("aal.performed_by_id = :userId", { userId });
    if (search) {
      summaryQb.andWhere(
        "(aal.application_no ILIKE :q OR a.application_no ILIKE :q OR a.title ILIKE :q OR beneficiary.full_name ILIKE :q OR beneficiary.cnic ILIKE :q)",
        { q: `%${search}%` },
      );
    }
    if (aidType) {
      summaryQb.andWhere("a.requested_aid_type = :aidType", { aidType });
    }
    if (district) {
      summaryQb.andWhere("beneficiary.district ILIKE :district", {
        district: `%${district}%`,
      });
    }
    if (stage) {
      this.applyStageFilterToAlias(summaryQb, stage, "a");
    } else if (status) {
      summaryQb.andWhere("a.status = :status", { status });
    }
    if (day) {
      summaryQb.andWhere(
        "aal.created_at >= :dayStart AND aal.created_at <= :dayEnd",
        {
          dayStart: `${day} 00:00:00`,
          dayEnd: `${day} 23:59:59.999`,
        },
      );
    } else {
      if (startDate) {
        summaryQb.andWhere("aal.created_at >= :listStart", {
          listStart: `${startDate} 00:00:00`,
        });
      }
      if (endDate) {
        summaryQb.andWhere("aal.created_at <= :listEnd", {
          listEnd: `${endDate} 23:59:59.999`,
        });
      }
    }

    const actionRows = await summaryQb
      .clone()
      .select("aal.action", "action")
      .addSelect("COUNT(*)", "cnt")
      .groupBy("aal.action")
      .getRawMany();
    const appsTouchedRow = await summaryQb
      .clone()
      .select("COUNT(DISTINCT aal.application_id)", "cnt")
      .getRawOne();

    const action_counts: Record<string, number> = {};
    for (const row of actionRows) {
      action_counts[String(row.action)] = Number(row.cnt) || 0;
    }

    let user = rows[0]?.performed_by || null;
    if (!user) {
      user = await this.auditRepo.manager.getRepository(User).findOne({
        where: { id: userId },
      });
    }

    const data = rows.map((row) => ({
      id: row.id,
      application_id: row.application_id,
      application_no:
        row.application_no || row.application?.application_no || null,
      application_status: row.application?.status ?? null,
      requested_aid_type: row.application?.requested_aid_type ?? null,
      beneficiary: row.application?.beneficiary
        ? {
            id: row.application.beneficiary.id,
            full_name: row.application.beneficiary.full_name,
            cnic: row.application.beneficiary.cnic,
          }
        : null,
      action: row.action,
      source: row.source,
      changes: row.changes ?? [],
      performed_by_id: row.performed_by_id,
      performed_by: row.performed_by
        ? {
            id: row.performed_by.id,
            email: row.performed_by.email ?? null,
            first_name: row.performed_by.first_name ?? null,
            last_name: row.performed_by.last_name ?? null,
          }
        : null,
      metadata: row.metadata,
      created_at: row.created_at,
    }));

    return {
      user: user
        ? {
            id: user.id,
            email: user.email ?? null,
            first_name: (user as any).first_name ?? null,
            last_name: (user as any).last_name ?? null,
          }
        : { id: userId, email: null, first_name: null, last_name: null },
      summary: {
        total_events: total,
        applications_touched: Number(appsTouchedRow?.cnt) || 0,
        action_counts,
      },
      data,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      currentPage: page,
      pageSize,
    };
  }

  private applyStageFilterToAlias(
    qb: ReturnType<Repository<AidApplicationAuditLog>["createQueryBuilder"]>,
    stage: string,
    alias: string,
  ) {
    switch (stage) {
      case "draft":
        qb.andWhere(`${alias}.status = :st`, { st: AidApplicationStatus.DRAFT });
        break;
      case "submitted":
        qb.andWhere(`${alias}.status = :st`, {
          st: AidApplicationStatus.SUBMITTED,
        });
        break;
      case "investigation":
        qb.andWhere(`${alias}.status IN (:...sts)`, {
          sts: [
            AidApplicationStatus.UNDER_REVIEW,
            AidApplicationStatus.VERIFICATION_COMPLETED,
          ],
        });
        break;
      case "manager_review":
        qb.andWhere(`${alias}.status IN (:...sts)`, {
          sts: [
            AidApplicationStatus.MANAGER_REVIEW,
            AidApplicationStatus.VERIFICATION_COMPLETED,
          ],
        });
        break;
      case "pending_approval":
        qb.andWhere(`${alias}.status IN (:...sts)`, {
          sts: [
            AidApplicationStatus.MEAL_APPROVAL_REQUIRED,
            AidApplicationStatus.CEO_APPROVAL_REQUIRED,
          ],
        });
        break;
      case "meal_approval":
        qb.andWhere(`${alias}.status = :st`, {
          st: AidApplicationStatus.MEAL_APPROVAL_REQUIRED,
        });
        break;
      case "approved":
        qb.andWhere(`${alias}.status IN (:...sts)`, {
          sts: [
            AidApplicationStatus.SUCCESSFUL,
            AidApplicationStatus.DELIVERED,
          ],
        });
        break;
      case "incomplete":
        qb.andWhere(`${alias}.status = :st`, {
          st: AidApplicationStatus.INCOMPLETE,
        });
        break;
      case "returned":
        qb.andWhere(`${alias}.status = :st`, {
          st: AidApplicationStatus.REJECTED,
        });
        break;
      default:
        break;
    }
  }
}
