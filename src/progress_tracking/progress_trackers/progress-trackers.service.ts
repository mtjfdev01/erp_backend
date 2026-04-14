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
      public_tracking_token: null,
      overall_status: TrackerOverallStatus.PENDING,
      created_by: currentUser?.id === -1 ? null : currentUser,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    const savedTracker = await this.trackersRepo.save(trackerEntity);
    const tracker = Array.isArray(savedTracker)
      ? savedTracker[0]
      : savedTracker;

    const templateSteps = await this.templateStepsRepo.find({
      where: { template_id: template.id, is_archived: false },
      order: { step_order: "ASC" },
    });
    if (!templateSteps.length)
      throw new BadRequestException("Template has no steps");

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
  }) {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.trackersRepo
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.template", "template")
      .where("t.is_archived = false");

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

    qb.orderBy("t.created_at", "DESC").skip(skip).take(pageSize);
    const [data, total] = await qb.getManyAndCount();
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
    return steps;
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

    this.validateTransition(step.status, dto.status);

    const now = new Date();
    const updateData: any = {
      status: dto.status,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    };

    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;
    if (dto.donor_visible !== undefined)
      updateData.donor_visible = dto.donor_visible;

    if (dto.status === ProgressStatus.IN_PROGRESS && !step.started_at)
      updateData.started_at = now;
    if (dto.status === ProgressStatus.COMPLETED) updateData.completed_at = now;
    if (dto.status === ProgressStatus.SKIPPED) updateData.skipped_at = now;
    if (dto.status === ProgressStatus.CANCELLED) updateData.cancelled_at = now;

    await this.trackerStepsRepo.update(stepId, updateData);

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

    if (dto.status === ProgressStatus.COMPLETED) {
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
    });
    if (!step) throw new NotFoundException("Tracker step not found");

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
    if (!existing) throw new NotFoundException("Evidence not found");
    await this.evidenceRepo.update(evidenceId, {
      ...dto,
      updated_by: currentUser?.id === -1 ? null : currentUser,
    } as any);
    return this.evidenceRepo.findOne({ where: { id: evidenceId } });
  }

  async archiveEvidence(evidenceId: number, currentUser?: any) {
    const existing = await this.evidenceRepo.findOne({
      where: { id: evidenceId, is_archived: false },
    });
    if (!existing) throw new NotFoundException("Evidence not found");
    await this.evidenceRepo.update(evidenceId, {
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

    return tracker;
  }
}
