import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  OperationalQuery,
  OperationalQueryStatus,
} from "./entities/operational-query.entity";
import { CreateOperationalQueryDto } from "./dto/create-operational-query.dto";
import { DonationBoxService } from "../donation_box/donation-box.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationType } from "../../notifications/entities/notification.entity";
import { User } from "../../users/user.entity";
import { BoxStatus } from "../donation_box/entities/donation-box.entity";

export interface OperationalQueryListParams {
  status?: string;
  subject_type?: string;
  subject_id?: number;
  action?: string;
  scope?: "all" | "mine" | "for_me";
  page?: number;
  pageSize?: number;
  search?: string;
}

@Injectable()
export class OperationalQueriesService {
  constructor(
    @InjectRepository(OperationalQuery)
    private readonly queryRepo: Repository<OperationalQuery>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly donationBoxService: DonationBoxService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private userId(user?: { id?: number } | null): number | null {
    const id = Number(user?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  async create(
    dto: CreateOperationalQueryDto,
    currentUser?: { id?: number },
  ): Promise<OperationalQuery> {
    const requesterId = this.userId(currentUser);
    if (!requesterId) {
      throw new ForbiddenException("Authentication required");
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException("Reason is required");
    }
    const approverId = Number(dto.approver_id);
    const subjectId = Number(dto.subject_id);
    if (!Number.isFinite(approverId) || approverId <= 0) {
      throw new BadRequestException("Approver is required");
    }
    if (!Number.isFinite(subjectId) || subjectId <= 0) {
      throw new BadRequestException("subject_id is required");
    }
    if (approverId === requesterId) {
      throw new BadRequestException("You cannot assign yourself as approver");
    }

    const approver = await this.userRepo.findOne({
      where: { id: approverId },
    });
    if (!approver) {
      throw new NotFoundException(`Approver #${approverId} not found`);
    }

    const normalizedDto: CreateOperationalQueryDto = {
      ...dto,
      subject_id: subjectId,
      approver_id: approverId,
    };

    const prepared = await this.prepareSubjectRequest(normalizedDto);

    const existingPending = await this.queryRepo.findOne({
      where: {
        subject_type: normalizedDto.subject_type,
        subject_id: subjectId,
        action: normalizedDto.action,
        status: OperationalQueryStatus.PENDING,
        is_archived: false,
      },
      order: { id: "DESC" },
    });
    if (existingPending) {
      throw new BadRequestException(
        `A pending operational query (#${existingPending.id}) already exists for this change. Wait for approval or cancel it first.`,
      );
    }

    const row = this.queryRepo.create({
      subject_type: normalizedDto.subject_type,
      subject_id: subjectId,
      action: normalizedDto.action,
      title: (normalizedDto.title || prepared.title).trim(),
      reason: normalizedDto.reason.trim(),
      payload: prepared.payload,
      previous_payload: prepared.previous_payload,
      subject_meta: normalizedDto.subject_meta || prepared.subject_meta,
      requested_by_id: requesterId,
      approver_id: approverId,
      status: OperationalQueryStatus.PENDING,
      created_by: { id: requesterId } as any,
    });

    const saved = await this.queryRepo.save(row);

    try {
      await this.notificationsService.create(
        {
          title: "Operational query awaiting approval",
          message: `${saved.title} — please approve or reject.`,
          type: NotificationType.WARNING,
          link: `/dms/operational-queries/view/${saved.id}`,
          metadata: {
            operational_query_id: saved.id,
            event: "operational_query_created",
          },
        },
        [saved.approver_id],
        currentUser,
      );
    } catch (err: any) {
      console.warn("Failed to notify operational query approver:", err?.message);
    }

    return this.findOne(saved.id);
  }

  private async prepareSubjectRequest(dto: CreateOperationalQueryDto): Promise<{
    title: string;
    payload: Record<string, unknown>;
    previous_payload: Record<string, unknown>;
    subject_meta: Record<string, unknown>;
  }> {
    if (dto.subject_type === "donation_box" && dto.action === "change_status") {
      const box = await this.donationBoxService.findOne(dto.subject_id);
      const nextStatus = String(dto.payload?.status || "").trim();
      if (!nextStatus) {
        throw new BadRequestException("payload.status is required");
      }
      const allowed = Object.values(BoxStatus) as string[];
      if (!allowed.includes(nextStatus)) {
        throw new BadRequestException(`Invalid status: ${nextStatus}`);
      }
      if (nextStatus === box.status) {
        throw new BadRequestException("Status is already set to this value");
      }

      const removalDate =
        nextStatus === BoxStatus.REMOVED
          ? dto.payload?.removal_date || null
          : null;
      if (nextStatus === BoxStatus.REMOVED && !removalDate) {
        throw new BadRequestException(
          "Removal date is required when status is Removed",
        );
      }

      const payload: Record<string, unknown> = {
        status: nextStatus,
        removal_date: removalDate,
      };

      return {
        title: `Change status: ${box.status} → ${nextStatus}`,
        payload,
        previous_payload: {
          status: box.status,
          removal_date: box.removal_date || null,
          shop_name: box.shop_name,
          name: box.name,
          box_id_no: box.box_id_no,
          key_no: box.key_no,
        },
        subject_meta: {
          label: box.name || box.shop_name || box.box_id_no || `Box #${box.id}`,
          box_id_no: box.box_id_no,
          shop_name: box.shop_name,
          current_status: box.status,
          requested_status: nextStatus,
        },
      };
    }

    throw new BadRequestException(
      `Unsupported operational query: ${dto.subject_type}.${dto.action}`,
    );
  }

  async findAll(
    params: OperationalQueryListParams = {},
    currentUser?: { id?: number },
  ) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const userId = this.userId(currentUser);

    const qb = this.queryRepo
      .createQueryBuilder("q")
      .leftJoinAndSelect("q.requested_by", "requested_by")
      .leftJoinAndSelect("q.approver", "approver")
      .leftJoinAndSelect("q.decided_by", "decided_by")
      .where("q.is_archived = false");

    if (params.status && params.status !== "all") {
      qb.andWhere("q.status = :status", { status: params.status });
    }
    if (params.subject_type) {
      qb.andWhere("q.subject_type = :subjectType", {
        subjectType: params.subject_type,
      });
    }
    if (params.subject_id) {
      qb.andWhere("q.subject_id = :subjectId", {
        subjectId: params.subject_id,
      });
    }
    if (params.action) {
      qb.andWhere("q.action = :action", { action: params.action });
    }

    if (params.scope === "mine" && userId) {
      qb.andWhere("q.requested_by_id = :userId", { userId });
    } else if (params.scope === "for_me" && userId) {
      qb.andWhere("q.approver_id = :userId", { userId });
    }

    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      qb.andWhere(
        `(LOWER(q.title) LIKE LOWER(:term)
          OR LOWER(q.reason) LIKE LOWER(:term)
          OR CAST(q.id AS TEXT) LIKE :term)`,
        { term },
      );
    }

    qb.orderBy("q.created_at", "DESC").addOrderBy("q.id", "DESC");

    const [data, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async findOne(id: number): Promise<OperationalQuery> {
    const row = await this.queryRepo.findOne({
      where: { id, is_archived: false },
      relations: ["requested_by", "approver", "decided_by"],
    });
    if (!row) {
      throw new NotFoundException(`Operational query #${id} not found`);
    }
    return row;
  }

  async approve(
    id: number,
    reviewNote: string | undefined,
    currentUser?: { id?: number },
  ): Promise<OperationalQuery> {
    const row = await this.findOne(id);
    const actorId = this.userId(currentUser);
    if (!actorId) throw new ForbiddenException("Authentication required");
    if (row.status !== OperationalQueryStatus.PENDING) {
      throw new BadRequestException(`Query is already ${row.status}`);
    }
    if (row.approver_id !== actorId) {
      throw new ForbiddenException("Only the assigned approver can approve this query");
    }

    await this.applyPayload(row, currentUser);

    row.status = OperationalQueryStatus.APPROVED;
    row.review_note = reviewNote?.trim() || null;
    row.decided_by_id = actorId;
    row.decided_at = new Date();
    row.applied_at = new Date();
    row.updated_by = { id: actorId } as any;
    const saved = await this.queryRepo.save(row);

    try {
      await this.notificationsService.create(
        {
          title: "Operational query approved",
          message: `${saved.title} was approved and applied.`,
          type: NotificationType.SUCCESS,
          link: `/dms/operational-queries/view/${saved.id}`,
          metadata: {
            operational_query_id: saved.id,
            event: "operational_query_approved",
          },
        },
        [saved.requested_by_id],
        currentUser,
      );
    } catch (err: any) {
      console.warn("Failed to notify requester of approval:", err?.message);
    }

    return this.findOne(saved.id);
  }

  async reject(
    id: number,
    reviewNote: string | undefined,
    currentUser?: { id?: number },
  ): Promise<OperationalQuery> {
    const row = await this.findOne(id);
    const actorId = this.userId(currentUser);
    if (!actorId) throw new ForbiddenException("Authentication required");
    if (row.status !== OperationalQueryStatus.PENDING) {
      throw new BadRequestException(`Query is already ${row.status}`);
    }
    if (row.approver_id !== actorId) {
      throw new ForbiddenException("Only the assigned approver can reject this query");
    }

    row.status = OperationalQueryStatus.REJECTED;
    row.review_note = reviewNote?.trim() || null;
    row.decided_by_id = actorId;
    row.decided_at = new Date();
    row.updated_by = { id: actorId } as any;
    const saved = await this.queryRepo.save(row);

    try {
      await this.notificationsService.create(
        {
          title: "Operational query rejected",
          message: `${saved.title} was rejected.${
            saved.review_note ? ` Note: ${saved.review_note}` : ""
          }`,
          type: NotificationType.ERROR,
          link: `/dms/operational-queries/view/${saved.id}`,
          metadata: {
            operational_query_id: saved.id,
            event: "operational_query_rejected",
          },
        },
        [saved.requested_by_id],
        currentUser,
      );
    } catch (err: any) {
      console.warn("Failed to notify requester of rejection:", err?.message);
    }

    return this.findOne(saved.id);
  }

  async cancel(
    id: number,
    currentUser?: { id?: number },
  ): Promise<OperationalQuery> {
    const row = await this.findOne(id);
    const actorId = this.userId(currentUser);
    if (!actorId) throw new ForbiddenException("Authentication required");
    if (row.status !== OperationalQueryStatus.PENDING) {
      throw new BadRequestException(`Query is already ${row.status}`);
    }
    if (row.requested_by_id !== actorId) {
      throw new ForbiddenException("Only the requester can cancel this query");
    }

    row.status = OperationalQueryStatus.CANCELLED;
    row.decided_by_id = actorId;
    row.decided_at = new Date();
    row.updated_by = { id: actorId } as any;
    return this.queryRepo.save(row);
  }

  private async applyPayload(
    row: OperationalQuery,
    currentUser?: { id?: number },
  ): Promise<void> {
    if (row.subject_type === "donation_box" && row.action === "change_status") {
      await this.donationBoxService.update(
        row.subject_id,
        {
          status: row.payload.status,
          removal_date: row.payload.removal_date ?? null,
        },
        currentUser,
      );
      return;
    }
    throw new BadRequestException(
      `No apply handler for ${row.subject_type}.${row.action}`,
    );
  }
}
