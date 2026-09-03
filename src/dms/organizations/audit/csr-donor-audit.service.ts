import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CsrDonorAuditLog } from "./entities/csr-donor-audit-log.entity";
import { DonorAuditChange } from "../../donor/audit/donor-audit.types";

export type LogCsrDonorAuditParams = {
  csrDonorId: number;
  action: string;
  source: string;
  changes: DonorAuditChange[];
  performedByUserId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type CsrDonorAuditHistoryEntry = {
  id: number;
  csr_donor_id: number | null;
  action: string;
  source: string;
  changes: DonorAuditChange[];
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
export class CsrDonorAuditService {
  private readonly logger = new Logger(CsrDonorAuditService.name);

  constructor(
    @InjectRepository(CsrDonorAuditLog)
    private readonly auditRepo: Repository<CsrDonorAuditLog>,
  ) {}

  async log(params: LogCsrDonorAuditParams): Promise<void> {
    if (!params.changes?.length) return;
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          csr_donor_id: params.csrDonorId,
          action: params.action,
          source: params.source,
          changes: params.changes,
          performed_by_id: params.performedByUserId ?? null,
          metadata: params.metadata ?? null,
        }),
      );
    } catch (err: any) {
      this.logger.warn(
        `CSR donor audit log failed [csr_donor=${params.csrDonorId}]: ${err?.message || err}`,
      );
    }
  }

  async findByCsrDonorId(csrDonorId: number): Promise<CsrDonorAuditHistoryEntry[]> {
    const rows = await this.auditRepo.find({
      where: { csr_donor_id: csrDonorId },
      relations: ["performed_by"],
      order: { created_at: "DESC", id: "DESC" },
    });
    return rows.map((row) => ({
      id: row.id,
      csr_donor_id: row.csr_donor_id,
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
}
