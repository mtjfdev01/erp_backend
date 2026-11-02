import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AidApplication } from "../entities/aid-application.entity";
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
}
