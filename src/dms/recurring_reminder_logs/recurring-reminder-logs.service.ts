import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import {
  RecurringReminderChannelStatus,
  RecurringReminderLog,
  RecurringReminderLogAction,
  RecurringReminderLogSource,
} from "./entities/recurring-reminder-log.entity";

export type CreateRecurringReminderLogInput = {
  run_id: string;
  source: RecurringReminderLogSource;
  action_type?: RecurringReminderLogAction;
  frequency?: string | null;
  period_key?: string | null;
  donor_id?: number | null;
  donor_name?: string | null;
  donor_email?: string | null;
  donor_phone?: string | null;
  mail_status?: RecurringReminderChannelStatus;
  wa_status?: RecurringReminderChannelStatus;
  pledge_id?: number | null;
  recurring_donation_id?: number | null;
  campaign_id?: number | null;
  campaign_title?: string | null;
  donation_id?: number | null;
  dry_run?: boolean;
  error_message?: string | null;
  amount?: number | null;
  currency?: string | null;
};

@Injectable()
export class RecurringReminderLogsService {
  private readonly logger = new Logger(RecurringReminderLogsService.name);

  constructor(
    @InjectRepository(RecurringReminderLog)
    private readonly logRepo: Repository<RecurringReminderLog>,
  ) {}

  createRunId(): string {
    return randomUUID();
  }

  async createLog(
    input: CreateRecurringReminderLogInput,
  ): Promise<RecurringReminderLog | null> {
    try {
      const row = this.logRepo.create({
        run_id: input.run_id,
        source: input.source,
        action_type: input.action_type || "reminder",
        frequency: input.frequency || null,
        period_key: input.period_key || null,
        donor_id: input.donor_id ?? null,
        donor_name: input.donor_name || null,
        donor_email: input.donor_email || null,
        donor_phone: input.donor_phone || null,
        mail_status: input.mail_status || "n_a",
        wa_status: input.wa_status || "n_a",
        pledge_id: input.pledge_id ?? null,
        recurring_donation_id: input.recurring_donation_id ?? null,
        campaign_id: input.campaign_id ?? null,
        campaign_title: input.campaign_title || null,
        donation_id: input.donation_id ?? null,
        dry_run: input.dry_run === true,
        error_message: input.error_message || null,
        amount: input.amount ?? null,
        currency: input.currency || null,
      });
      return await this.logRepo.save(row);
    } catch (err: any) {
      this.logger.warn(
        `Failed to write recurring reminder log: ${err?.message || err}`,
      );
      return null;
    }
  }

  async search(payload: Record<string, any>) {
    const pagination = payload.pagination || {};
    const page = Math.max(1, Number(pagination.page) || 1);
    let pageSize = Number(pagination.pageSize);
    if (!Number.isFinite(pageSize)) pageSize = 10;
    if (pageSize <= 0) pageSize = 10;
    pageSize = Math.min(pageSize, 200);

    const sortField = [
      "id",
      "created_at",
      "donor_name",
      "donor_email",
      "mail_status",
      "wa_status",
      "period_key",
      "source",
      "action_type",
    ].includes(pagination.sortField)
      ? pagination.sortField
      : "created_at";
    const sortOrder =
      String(pagination.sortOrder || "DESC").toUpperCase() === "ASC"
        ? "ASC"
        : "DESC";

    const filters = payload.filters || payload;
    const qb = this.logRepo
      .createQueryBuilder("log")
      .where("log.is_archived = false");

    if (filters.search) {
      const term = `%${String(filters.search).trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(COALESCE(log.donor_name, '')) LIKE :term
          OR LOWER(COALESCE(log.donor_email, '')) LIKE :term
          OR LOWER(COALESCE(log.donor_phone, '')) LIKE :term
          OR LOWER(COALESCE(log.campaign_title, '')) LIKE :term
          OR CAST(log.donor_id AS text) LIKE :term
          OR LOWER(COALESCE(log.run_id, '')) LIKE :term)`,
        { term },
      );
    }
    if (filters.mail_status) {
      qb.andWhere("log.mail_status = :mail_status", {
        mail_status: filters.mail_status,
      });
    }
    if (filters.wa_status) {
      qb.andWhere("log.wa_status = :wa_status", {
        wa_status: filters.wa_status,
      });
    }
    if (filters.source) {
      qb.andWhere("log.source = :source", { source: filters.source });
    }
    if (filters.action_type) {
      qb.andWhere("log.action_type = :action_type", {
        action_type: filters.action_type,
      });
    }
    if (filters.period_key) {
      qb.andWhere("log.period_key = :period_key", {
        period_key: filters.period_key,
      });
    }
    if (filters.run_id) {
      qb.andWhere("log.run_id = :run_id", { run_id: filters.run_id });
    }
    if (filters.donor_id) {
      qb.andWhere("log.donor_id = :donor_id", {
        donor_id: Number(filters.donor_id),
      });
    }
    if (filters.date) {
      qb.andWhere("DATE(log.created_at) = :date", { date: filters.date });
    }
    if (filters.start_date) {
      qb.andWhere("DATE(log.created_at) >= :start_date", {
        start_date: filters.start_date,
      });
    }
    if (filters.end_date) {
      qb.andWhere("DATE(log.created_at) <= :end_date", {
        end_date: filters.end_date,
      });
    }

    const totalItems = await qb.getCount();
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const data = await qb
      .orderBy(`log.${sortField}`, sortOrder)
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  async findOne(id: number) {
    const row = await this.logRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) {
      throw new NotFoundException("Reminder log not found");
    }
    return row;
  }
}
