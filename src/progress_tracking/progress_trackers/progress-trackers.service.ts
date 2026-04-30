import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Repository } from "typeorm";
import * as crypto from "crypto";
import { ProgressTracker } from "./progress_tracker.entity";
import { ProgressTrackerStep } from "./progress_tracker_step.entity";
import { ProgressStepEvidence } from "./progress_step_evidence.entity";
import { ProgressWorkflowTemplate } from "../progress_workflow_templates/progress_workflow_template.entity";
import { ProgressWorkflowTemplateStep } from "../progress_workflow_templates/progress_workflow_template_step.entity";
import { CreateTrackerDto } from "./dto/create-tracker.dto";
import { UpdateTrackerDto } from "./dto/update-tracker.dto";
import { UpdateTrackerStepStatusDto } from "./dto/update-tracker-step-status.dto";
import { AddEvidenceDto } from "./dto/add-evidence.dto";
import {
  ProgressStatus,
  TrackerOverallStatus,
  ParentEntityType,
} from "../common/progress-tracking.enum";
import { ProgressNotificationsService } from "../progress_notifications/progress-notifications.service";
import { Donation } from "../../donations/entities/donation.entity";
import { ProgressBatchStepEvidence } from "../progress_batches/progress_batch_step_evidence.entity";
import { ProgressWorkflowBatch } from "../progress_batches/progress_workflow_batch.entity";
import { DonationBatchAllocation } from "../progress_batches/donation_batch_allocation.entity";

@Injectable()
export class ProgressTrackersService {
  constructor(
    @InjectRepository(ProgressTracker)
    private readonly trackersRepo: Repository<ProgressTracker>,
    @InjectRepository(ProgressTrackerStep)
    private readonly trackerStepsRepo: Repository<ProgressTrackerStep>,
    @InjectRepository(ProgressStepEvidence)
    private readonly evidenceRepo: Repository<ProgressStepEvidence>,
    @InjectRepository(ProgressWorkflowTemplate)
    private readonly templatesRepo: Repository<ProgressWorkflowTemplate>,
    @InjectRepository(ProgressWorkflowTemplateStep)
    private readonly templateStepsRepo: Repository<ProgressWorkflowTemplateStep>,
    private readonly notifications: ProgressNotificationsService,
    @InjectRepository(Donation)
    private readonly donationsRepo: Repository<Donation>,
    @InjectRepository(ProgressBatchStepEvidence)
    private readonly batchEvidenceRepo: Repository<ProgressBatchStepEvidence>,
    @InjectRepository(ProgressWorkflowBatch)
    private readonly workflowBatchesRepo: Repository<ProgressWorkflowBatch>,
    @InjectRepository(DonationBatchAllocation)
    private readonly allocationsRepo: Repository<DonationBatchAllocation>,
  ) {}

  private deriveOverallStatus(
    steps: ProgressTrackerStep[],
  ): TrackerOverallStatus {
    const active = steps.filter((s) => !s.is_archived);
    if (active.length === 0) return TrackerOverallStatus.PENDING;
    if (active.every((s) => s.status === ProgressStatus.CANCELLED))
      return TrackerOverallStatus.CANCELLED;
    if (
      active.every(
        (s) =>
          s.status === ProgressStatus.COMPLETED ||
          s.status === ProgressStatus.SKIPPED,
      )
    )
      return TrackerOverallStatus.COMPLETED;
    if (
      active.some(
        (s) =>
          s.status === ProgressStatus.IN_PROGRESS ||
          s.status === ProgressStatus.COMPLETED,
      )
    )
      return TrackerOverallStatus.IN_PROGRESS;
    return TrackerOverallStatus.PENDING;
  }

  private validateTransition(from: ProgressStatus, to: ProgressStatus) {
    const allowed: Record<ProgressStatus, ProgressStatus[]> = {
      [ProgressStatus.PENDING]: [
        ProgressStatus.IN_PROGRESS,
        ProgressStatus.COMPLETED,
        ProgressStatus.SKIPPED,
        ProgressStatus.CANCELLED,
      ],
      [ProgressStatus.IN_PROGRESS]: [
        ProgressStatus.COMPLETED,
        ProgressStatus.CANCELLED,
      ],
      [ProgressStatus.COMPLETED]: [],
      [ProgressStatus.SKIPPED]: [],
      [ProgressStatus.CANCELLED]: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(
        `Invalid step transition: ${from} -> ${to}`,
      );
    }
  }

  private async resolveTemplateStepsWithParentFallback(templateId: number): Promise<{
    steps: ProgressWorkflowTemplateStep[];
    source_template_id: number;
  }> {
    let currentId: number | null = templateId;
    const visited = new Set<number>();

    for (let depth = 0; depth < 20 && currentId; depth += 1) {
      if (visited.has(currentId)) {
        throw new BadRequestException("Template parent cycle detected");
      }
      visited.add(currentId);

      const steps = await this.templateStepsRepo.find({
        where: { template_id: currentId, is_archived: false },
        order: { step_order: "ASC" },
      });
      if (steps.length) return { steps, source_template_id: currentId };

      const t = await this.templatesRepo.findOne({
        where: { id: currentId, is_archived: false } as any,
        select: ["id", "parent_id"] as any,
      });
      if (!t) break;
      currentId = (t as any).parent_id ?? null;
    }

    throw new BadRequestException(
      "Template has no steps (and no parent steps)",
    );
  }

  async createTrackerFromTemplate(dto: CreateTrackerDto, currentUser?: any) {
    const template = await this.templatesRepo.findOne({
      where: { id: dto.template_id, is_archived: false },
    });
    if (!template) throw new NotFoundException("Template not found");

    const donationId = dto.donation_id ?? null;
    if (donationId) {
      const existing = await this.trackersRepo.findOne({
        where: { donation_id: donationId, is_archived: false },
      });
      if (existing)
        throw new ConflictException("Tracker already exists for this donation");
    }

    const trackerEntity = this.trackersRepo.create({
      template_id: template.id,
      donation_id: donationId,
      parent_type:
        dto.parent_type || (donationId ? ParentEntityType.DONATION : null),
      parent_id: dto.parent_id || (donationId ? donationId : null),
      donor_visible: dto.donor_visible ?? true,
      batch_parts_count: dto.batch_parts_count ?? null,
      public_tracking_token: null,
      overall_status: TrackerOverallStatus.PENDING,
      created_by: currentUser?.id === -1 ? null : currentUser,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    const savedTracker = await this.trackersRepo.save(trackerEntity);
    const tracker = Array.isArray(savedTracker)
      ? savedTracker[0]
      : savedTracker;

    const { steps: templateSteps } =
      await this.resolveTemplateStepsWithParentFallback(template.id);

    const stepRows: DeepPartial<ProgressTrackerStep>[] = templateSteps.map(
      (ts) => ({
        tracker_id: tracker.id,
        template_step_id: ts.id,
        step_key: ts.step_key,
        title: ts.title,
        step_order: ts.step_order,
        status: ProgressStatus.PENDING,
        donor_visible: true,
        created_by: currentUser?.id === -1 ? null : currentUser,
        updated_by: currentUser?.id === -1 ? null : currentUser,
      }),
    );
    await this.trackerStepsRepo.save(
      stepRows.map((row) => this.trackerStepsRepo.create(row)),
    );

    return this.getTrackerDetail(tracker.id);
  }

  async listTrackers(options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    template_id?: number;
    donation_id?: number;
    batch_id?: number;
    batch_number?: number;
    batch_status?: "open" | "closed";
  }) {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.trackersRepo
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.template", "template")
      // For listing UI: compute the earliest batch number linked to this donation (if any).
      .addSelect((subQb) => {
        return subQb
          .select("MIN(batch.batch_number)", "min_batch_number")
          .from("donation_batch_allocations", "alloc2")
          .innerJoin(
            "progress_workflow_batches",
            "batch",
            "batch.id = alloc2.batch_id AND batch.is_archived = false",
          )
          .where("alloc2.is_archived = false")
          .andWhere("alloc2.donation_id = t.donation_id");
      }, "batch_number")
      .where("t.is_archived = false");

    if (options?.batch_id || options?.batch_number || options?.batch_status) {
      qb.leftJoin(
        "donation_batch_allocations",
        "alloc",
        "alloc.donation_id = t.donation_id AND alloc.is_archived = false",
      ).leftJoin(
        "progress_workflow_batches",
        "batch",
        "batch.id = alloc.batch_id AND batch.is_archived = false",
      );

      if (options?.batch_id) qb.andWhere("batch.id = :bid", { bid: options.batch_id });
      if (options?.batch_number)
        qb.andWhere("batch.batch_number = :bn", { bn: options.batch_number });
      if (options?.batch_status === "open")
        qb.andWhere("batch.is_closed = false");
      if (options?.batch_status === "closed")
        qb.andWhere("batch.is_closed = true");

      qb.distinct(true);
    }

    if (options?.template_id)
      qb.andWhere("t.template_id = :templateId", {
        templateId: options.template_id,
      });
    if (options?.donation_id)
      qb.andWhere("t.donation_id = :donationId", {
        donationId: options.donation_id,
      });

    if (options?.search) {
      qb.andWhere(
        "(template.name ILIKE :q OR template.code ILIKE :q OR CAST(t.donation_id AS text) ILIKE :q)",
        { q: `%${options.search}%` },
      );
    }

    const total = await qb
      .clone()
      .orderBy()
      .skip(undefined as any)
      .take(undefined as any)
      .getCount();

    qb.orderBy("t.created_at", "DESC").skip(skip).take(pageSize);
    const { entities, raw } = await qb.getRawAndEntities();
    const data = entities.map((e: any, idx: number) => ({
      ...e,
      batch_number:
        raw?.[idx]?.batch_number != null ? Number(raw[idx].batch_number) : null,
    }));
    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getTrackerDetail(trackerId: number) {
    const tracker = await this.trackersRepo.findOne({
      where: { id: trackerId, is_archived: false },
      relations: ["template", "steps", "steps.evidence"],
    });
    if (!tracker) throw new NotFoundException("Tracker not found");
    tracker.steps = (tracker.steps || [])
      .filter((s) => !s.is_archived)
      .sort((a, b) => a.step_order - b.step_order);
    await this.attachBatchEvidenceIfApplicable(tracker as any);
    return tracker;
  }

  async getTrackerByDonationId(donationId: number) {
    const tracker = await this.trackersRepo.findOne({
      where: { donation_id: donationId, is_archived: false },
    });
    if (!tracker) throw new NotFoundException("Tracker not found for donation");
    return this.getTrackerDetail(tracker.id);
  }

  async updateTracker(
    trackerId: number,
    dto: UpdateTrackerDto,
    currentUser?: any,
  ) {
    const tracker = await this.trackersRepo.findOne({
      where: { id: trackerId, is_archived: false },
    });
    if (!tracker) throw new NotFoundException("Tracker not found");
    await this.trackersRepo.update(trackerId, {
      ...dto,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    return this.getTrackerDetail(trackerId);
  }

  async generateOrRegenerateToken(trackerId: number, currentUser?: any) {
    const tracker = await this.trackersRepo.findOne({
      where: { id: trackerId, is_archived: false },
    });
    if (!tracker) throw new NotFoundException("Tracker not found");
    const token = crypto.randomBytes(24).toString("hex");
    await this.trackersRepo.update(trackerId, {
      public_tracking_token: token,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    return { token };
  }

  async listSteps(trackerId: number) {
    const steps = await this.trackerStepsRepo.find({
      where: { tracker_id: trackerId, is_archived: false },
      relations: ["evidence"],
      order: { step_order: "ASC" },
    });
    // Attach shared batch evidence (if any) by resolving tracker.
    const tracker = await this.trackersRepo.findOne({
      where: { id: trackerId, is_archived: false },
      relations: ["template"] as any,
    });
    if (tracker) {
      await this.attachBatchEvidenceToSteps({
        donationId: tracker.donation_id,
        templateId: tracker.template_id,
        steps: steps as any,
      });
    }
    return steps;
  }

  private async attachBatchEvidenceIfApplicable(tracker: ProgressTracker): Promise<void> {
    if (!tracker?.template_id || !tracker?.donation_id) return;
    await this.attachBatchEvidenceToSteps({
      donationId: tracker.donation_id,
      templateId: tracker.template_id,
      steps: (tracker as any).steps || [],
    });
  }

  private async attachBatchEvidenceToSteps(params: {
    donationId: number | null;
    templateId: number | null;
    steps: Array<any>;
  }): Promise<void> {
    const donationId = params.donationId != null ? Number(params.donationId) : NaN;
    const templateId = params.templateId != null ? Number(params.templateId) : NaN;
    if (!Number.isFinite(donationId) || donationId <= 0) return;
    if (!Number.isFinite(templateId) || templateId <= 0) return;

    const template = await this.templatesRepo.findOne({
      where: { id: templateId, is_archived: false } as any,
      select: ["id", "is_batchable"] as any,
    });
    if (!template || !(template as any).is_batchable) return;

    const allocs = await this.allocationsRepo.find({
      where: { donation_id: donationId, is_archived: false } as any,
      select: ["batch_id"] as any,
    });
    const batchIds = Array.from(
      new Set((allocs || []).map((a: any) => Number(a.batch_id)).filter((x) => Number.isFinite(x))),
    );
    if (!batchIds.length) return;

    const batches = await this.workflowBatchesRepo.find({
      where: batchIds.map((id) => ({ id, is_archived: false } as any)) as any,
      select: ["id", "batch_number"] as any,
    });
    const batchNumberById = new Map<number, number>();
    (batches || []).forEach((b: any) => {
      batchNumberById.set(Number(b.id), Number(b.batch_number));
    });

    const stepKeys = Array.from(
      new Set((params.steps || []).map((s) => String(s.step_key || "")).filter(Boolean)),
    );
    if (!stepKeys.length) return;

    const batchEvidence = await this.batchEvidenceRepo
      .createQueryBuilder("e")
      .where("e.is_archived = false")
      .andWhere("e.batch_id IN (:...batchIds)", { batchIds })
      .andWhere("e.step_key IN (:...stepKeys)", { stepKeys })
      .orderBy("e.sort_order", "ASC")
      .addOrderBy("e.created_at", "ASC")
      .getMany();

    const byStepKey = new Map<string, any[]>();
    for (const ev of batchEvidence || []) {
      const key = String((ev as any).step_key || "");
      if (!key) continue;
      const bn = batchNumberById.get(Number((ev as any).batch_id)) || null;
      const wrapped = {
        ...ev,
        evidence_scope: "batch",
        evidence_label: bn ? `Batch #${bn} evidence` : "Batch evidence",
        batch_id: (ev as any).batch_id,
        batch_number: bn,
      };
      byStepKey.set(key, [...(byStepKey.get(key) || []), wrapped]);
    }

    for (const s of params.steps || []) {
      const key = String(s.step_key || "");
      const shared = byStepKey.get(key) || [];
      if (!shared.length) continue;
      const own = Array.isArray(s.evidence) ? s.evidence : [];
      s.evidence = [...shared, ...own];
    }
  }

  private async resolveBatchTrackerIdsForDonation(params: {
    donationId: number;
    templateId: number;
  }): Promise<number[]> {
    const template = await this.templatesRepo.findOne({
      where: { id: params.templateId, is_archived: false } as any,
      select: ["id", "is_batchable"] as any,
    });
    if (!template || !(template as any).is_batchable) return [];

    const allocs = await this.allocationsRepo.find({
      where: { donation_id: params.donationId, is_archived: false } as any,
      select: ["batch_id"] as any,
    });
    const batchIds = Array.from(
      new Set(
        (allocs || [])
          .map((a: any) => Number(a.batch_id))
          .filter((x) => Number.isFinite(x) && x > 0),
      ),
    );
    if (!batchIds.length) return [];

    const trackerRows = await this.trackersRepo
      .createQueryBuilder("t")
      .innerJoin(
        "donation_batch_allocations",
        "a",
        "a.donation_id = t.donation_id AND a.is_archived = false",
      )
      .where("t.is_archived = false")
      .andWhere("a.batch_id IN (:...batchIds)", { batchIds })
      .select(["t.id AS id"])
      .distinct(true)
      .getRawMany<{ id: string }>();

    return (trackerRows || [])
      .map((r) => Number(r.id))
      .filter((x) => Number.isFinite(x) && x > 0);
  }

  async updateStep(
    stepId: number,
    dto: UpdateTrackerStepStatusDto,
    currentUser?: any,
  ) {
    const step = await this.trackerStepsRepo.findOne({
      where: { id: stepId, is_archived: false },
      relations: ["tracker", "tracker.template", "tracker.donation"],
    });
    if (!step) throw new NotFoundException("Tracker step not found");

    const nextStatus = dto.status ?? step.status;
    if (dto.status !== undefined && dto.status !== step.status) {
      this.validateTransition(step.status, dto.status);
    }

    const now = new Date();
    const updateData: any = {
      status: nextStatus,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    };

    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.donor_visible !== undefined)
      updateData.donor_visible = dto.donor_visible;
    if (dto.donor_notified !== undefined)
      updateData.donor_notified = dto.donor_notified;

    if (nextStatus === ProgressStatus.IN_PROGRESS && !step.started_at)
      updateData.started_at = now;
    if (nextStatus === ProgressStatus.COMPLETED) updateData.completed_at = now;
    if (nextStatus === ProgressStatus.SKIPPED) updateData.skipped_at = now;
    if (nextStatus === ProgressStatus.CANCELLED) updateData.cancelled_at = now;

    await this.trackerStepsRepo.update(stepId, updateData);

    // BATCHING: If the template is batchable and this tracker is part of a batch,
    // propagate the same step_key status update to all trackers in the same batch(es).
    try {
      const templateId = (step as any)?.tracker?.template_id;
      const donationId = (step as any)?.tracker?.donation_id;
      const stepKey = String((step as any)?.step_key || "");
      if (templateId && donationId && stepKey && dto.status !== undefined) {
        const trackerIds = await this.resolveBatchTrackerIdsForDonation({
          donationId: Number(donationId),
          templateId: Number(templateId),
        });
        if (trackerIds.length) {
          // Update only steps still in the same "from" status to avoid breaking transitions for out-of-sync trackers.
          await this.trackerStepsRepo
            .createQueryBuilder()
            .update()
            .set(updateData)
            .where("is_archived = false")
            .andWhere("tracker_id IN (:...ids)", { ids: trackerIds })
            .andWhere("step_key = :stepKey", { stepKey })
            .andWhere("status = :fromStatus", { fromStatus: step.status })
            .execute();

          // Recompute overall_status for all affected trackers (including the original).
          const trackers = await this.trackersRepo.find({
            where: trackerIds.map((id) => ({ id, is_archived: false } as any)) as any,
            relations: ["steps"] as any,
          });
          for (const tr of trackers || []) {
            const overall = this.deriveOverallStatus(
              ((tr as any).steps || []).filter((s: any) => !s.is_archived),
            );
            await this.trackersRepo.update((tr as any).id, {
              overall_status: overall,
            } as any);
          }
        }
      }
    } catch (e) {
      // Best-effort; don't block the main step update.
    }

    const tracker = await this.trackersRepo.findOne({
      where: { id: step.tracker_id },
      relations: ["steps", "donation", "donation.donor"] as any,
    });
    if (tracker) {
      const overall = this.deriveOverallStatus(
        (tracker.steps || []).filter((s) => !s.is_archived),
      );
      await this.trackersRepo.update(tracker.id, {
        overall_status: overall,
      } as any);
    }

    const updatedStep = await this.trackerStepsRepo.findOne({
      where: { id: stepId },
      relations: ["evidence"],
    });

    if (nextStatus === ProgressStatus.COMPLETED) {
      try {
        const templateStep = step.template_step_id
          ? await this.templateStepsRepo.findOne({
              where: { id: step.template_step_id },
            })
          : null;
        if (templateStep?.notify_donor_on_complete) {
          const trackerFull = await this.trackersRepo.findOne({
            where: { id: step.tracker_id },
            relations: ["donation", "donation.donor"] as any,
          });
          const donor = (trackerFull as any)?.donation?.donor as any;
          const publicUrl = trackerFull?.public_tracking_token
            ? `${process.env.BASE_Frontend_URL || ""}/tracking/${trackerFull.public_tracking_token}`
            : null;
          await this.notifications.notifyDonorOnStepCompleted({
            tracker: trackerFull,
            step: updatedStep as any,
            recipientEmail: donor?.email || null,
            recipientPhone: donor?.phone || null,
            publicUrl,
          });

          // Later, WhatsApp/email integration can control this more precisely.
          // For now, consider "notify attempted successfully" as "notified".
          await this.trackerStepsRepo.update(stepId, {
            donor_notified: true,
          } as any);
        }
      } catch (e) {
        // notifications are best-effort; logs handle visibility
      }
    }

    return updatedStep;
  }

  async addEvidence(stepId: number, dto: AddEvidenceDto, currentUser?: any) {
    const step = await this.trackerStepsRepo.findOne({
      where: { id: stepId, is_archived: false },
      relations: ["tracker", "tracker.template"] as any,
    });
    if (!step) throw new NotFoundException("Tracker step not found");

    const templateId = (step as any)?.tracker?.template_id;
    const donationId = (step as any)?.tracker?.donation_id;

    const template = templateId
      ? await this.templatesRepo.findOne({
          where: { id: Number(templateId), is_archived: false } as any,
          select: ["id", "is_batchable"] as any,
        })
      : null;

    if (template && (template as any).is_batchable && donationId) {
      const allocs = await this.allocationsRepo.find({
        where: { donation_id: Number(donationId), is_archived: false } as any,
        select: ["batch_id"] as any,
      });
      const batchIds = Array.from(
        new Set((allocs || []).map((a: any) => Number(a.batch_id)).filter((x) => Number.isFinite(x))),
      );
      if (!batchIds.length) {
        // Fall back to tracker-scoped evidence if not yet allocated.
        const evidence = this.evidenceRepo.create({
          tracker_step_id: stepId,
          ...dto,
          created_by: currentUser?.id === -1 ? null : currentUser,
          updated_by: currentUser?.id === -1 ? null : currentUser,
        } as any);
        return this.evidenceRepo.save(evidence);
      }

      const created: ProgressBatchStepEvidence[] = [];
      for (const batchId of batchIds) {
        const ev = this.batchEvidenceRepo.create({
          batch_id: batchId,
          step_key: (step as any).step_key,
          ...dto,
          created_by: currentUser?.id === -1 ? null : currentUser,
          updated_by: currentUser?.id === -1 ? null : currentUser,
        } as any);
        const saved = await this.batchEvidenceRepo.save(ev as any);
        created.push(Array.isArray(saved) ? saved[0] : saved);
      }
      return { created: created.length, scope: "batch" } as any;
    }

    const evidence = this.evidenceRepo.create({
      tracker_step_id: stepId,
      ...dto,
      created_by: currentUser?.id === -1 ? null : currentUser,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    return this.evidenceRepo.save(evidence);
  }

  async updateEvidence(
    evidenceId: number,
    dto: Partial<AddEvidenceDto>,
    currentUser?: any,
  ) {
    const existing = await this.evidenceRepo.findOne({
      where: { id: evidenceId, is_archived: false },
    });
    if (existing) {
      await this.evidenceRepo.update(evidenceId, {
        ...dto,
        updated_by: currentUser?.id === -1 ? null : currentUser,
      } as any);
      return this.evidenceRepo.findOne({ where: { id: evidenceId } });
    }

    const batchExisting = await this.batchEvidenceRepo.findOne({
      where: { id: evidenceId, is_archived: false } as any,
    });
    if (!batchExisting) throw new NotFoundException("Evidence not found");
    await this.batchEvidenceRepo.update(evidenceId, {
      ...dto,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    return this.batchEvidenceRepo.findOne({ where: { id: evidenceId } as any });
  }

  async archiveEvidence(evidenceId: number, currentUser?: any) {
    const existing = await this.evidenceRepo.findOne({
      where: { id: evidenceId, is_archived: false },
    });
    if (existing) {
      await this.evidenceRepo.update(evidenceId, {
        is_archived: true,
        updated_by: currentUser?.id === -1 ? null : currentUser,
      } as any);
      return { message: "Evidence archived" };
    }

    const batchExisting = await this.batchEvidenceRepo.findOne({
      where: { id: evidenceId, is_archived: false } as any,
    });
    if (!batchExisting) throw new NotFoundException("Evidence not found");
    await this.batchEvidenceRepo.update(evidenceId, {
      is_archived: true,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    return { message: "Evidence archived" };
  }

  async getPublicTrackingByToken(token: string) {
    const tracker = await this.trackersRepo.findOne({
      where: { public_tracking_token: token, is_archived: false },
      relations: ["template", "steps", "steps.evidence"],
    });
    if (!tracker) throw new NotFoundException("Tracking not found");

    tracker.steps = (tracker.steps || [])
      .filter((s) => !s.is_archived && s.donor_visible)
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({
        ...s,
        evidence: (s.evidence || []).filter((e) => !e.is_archived),
      })) as any;

    await this.attachBatchEvidenceIfApplicable(tracker as any);
    return tracker;
  }
}
