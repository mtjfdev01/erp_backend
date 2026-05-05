import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { ProgressWorkflowTemplate } from "../progress_workflow_templates/progress_workflow_template.entity";
import { ProgressWorkflowBatch } from "./progress_workflow_batch.entity";
import { DonationBatchAllocation } from "./donation_batch_allocation.entity";
import { ProgressTracker } from "../progress_trackers/progress_tracker.entity";
import { TrackerOverallStatus } from "../common/progress-tracking.enum";

@Injectable()
export class ProgressBatchesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProgressWorkflowTemplate)
    private readonly templatesRepo: Repository<ProgressWorkflowTemplate>,
    @InjectRepository(ProgressWorkflowBatch)
    private readonly batchesRepo: Repository<ProgressWorkflowBatch>,
    @InjectRepository(DonationBatchAllocation)
    private readonly allocationsRepo: Repository<DonationBatchAllocation>,
    @InjectRepository(ProgressTracker)
    private readonly trackersRepo: Repository<ProgressTracker>,
  ) {}

  async getBatchingConfig(templateId: number): Promise<{
    is_batchable: boolean;
    batch_parts: number | null;
    batch_part_amount: number | null;
  }> {
    const template = await this.templatesRepo.findOne({
      where: { id: templateId, is_archived: false } as any,
      select: ["id", "is_batchable", "batch_parts", "batch_part_amount"] as any,
    });
    if (!template) throw new BadRequestException("Workflow template not found");
    return {
      is_batchable: Boolean((template as any).is_batchable),
      batch_parts: (template as any).batch_parts ?? null,
      batch_part_amount: (template as any).batch_part_amount ?? null,
    };
  }

  async hasAllocationsForDonation(donationId: number): Promise<boolean> {
    const count = await this.allocationsRepo.count({
      where: { donation_id: donationId, is_archived: false } as any,
    });
    return count > 0;
  }

  async hasAllocationsForDonationTemplate(
    donationId: number,
    templateId: number,
  ): Promise<boolean> {
    const count = await this.allocationsRepo.count({
      where: {
        donation_id: donationId,
        template_id: templateId,
        is_archived: false,
      } as any,
    });
    return count > 0;
  }

  async listBatchOptions(params: {
    status: "open" | "closed" | "all";
    search?: string;
    limit?: number;
  }): Promise<
    Array<{
      id: number;
      template_id: number;
      template_name: string | null;
      batch_number: number;
      is_closed: boolean;
      allocated_parts: number;
      batch_parts: number;
    }>
  > {
    const take = Math.min(Number(params.limit || 200) || 200, 500);

    const qb = this.batchesRepo
      .createQueryBuilder("b")
      .leftJoin(ProgressWorkflowTemplate, "t", "t.id = b.template_id")
      .leftJoin(
        DonationBatchAllocation,
        "a",
        "a.batch_id = b.id AND a.is_archived = false",
      )
      .leftJoin(
        ProgressTracker,
        "tr",
        "tr.donation_id = a.donation_id AND tr.is_archived = false",
      )
      .select([
        "b.id AS id",
        "b.template_id AS template_id",
        "t.name AS template_name",
        "b.batch_number AS batch_number",
        "b.is_closed AS is_closed",
        "b.allocated_parts AS allocated_parts",
        "b.batch_parts AS batch_parts",
      ])
      .where("b.is_archived = false");

    if (params.search) {
      const q = String(params.search).trim();
      if (q) {
        const n = Number(q);
        if (Number.isFinite(n)) {
          qb.andWhere("b.batch_number = :bn", { bn: n });
        } else {
          qb.andWhere("CAST(b.batch_number AS text) ILIKE :q", { q: `%${q}%` });
        }
      }
    }

    if (params.status === "open") {
      qb.andWhere("tr.id IS NOT NULL").andWhere(
        "tr.overall_status NOT IN (:...closed)",
        {
          closed: [
            TrackerOverallStatus.COMPLETED,
            TrackerOverallStatus.CANCELLED,
          ],
        },
      );
    } else if (params.status === "closed") {
      qb.andWhere("tr.id IS NOT NULL").andWhere(
        "tr.overall_status IN (:...closed)",
        {
          closed: [
            TrackerOverallStatus.COMPLETED,
            TrackerOverallStatus.CANCELLED,
          ],
        },
      );
    }

    qb.orderBy("b.batch_number", "DESC").take(take);
    const rows = await qb.getRawMany<any>();
    return rows.map((r) => ({
      id: Number(r.id),
      template_id: Number(r.template_id),
      template_name: r.template_name ?? null,
      batch_number: Number(r.batch_number),
      is_closed: Boolean(r.is_closed),
      allocated_parts: Number(r.allocated_parts),
      batch_parts: Number(r.batch_parts),
    }));
  }

  async allocateDonationIntoBatches(params: {
    template_id: number;
    donation_id: number;
    parts_requested: number;
    currentUser?: any;
  }): Promise<DonationBatchAllocation[]> {
    const template = await this.templatesRepo.findOne({
      where: { id: params.template_id, is_archived: false } as any,
    });
    if (!template) throw new BadRequestException("Workflow template not found");

    if (!template.is_batchable) {
      return [];
    }
    const batchParts = Number(template.batch_parts || 0);
    const partAmount = Number(template.batch_part_amount || 0);
    if (!Number.isFinite(batchParts) || batchParts <= 0) {
      throw new BadRequestException("Invalid template batch_parts");
    }
    if (!Number.isFinite(partAmount) || partAmount <= 0) {
      throw new BadRequestException("Invalid template batch_part_amount");
    }

    const partsRequested = Number(params.parts_requested || 0);
    if (!Number.isFinite(partsRequested) || partsRequested <= 0) {
      throw new BadRequestException(
        "parts_requested must be a positive integer",
      );
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      let remaining = partsRequested;
      const results: DonationBatchAllocation[] = [];

      while (remaining > 0) {
        // Lock the latest open batch for this template to avoid double-allocations.
        let batch = await qr.manager
          .getRepository(ProgressWorkflowBatch)
          .createQueryBuilder("b")
          .where("b.template_id = :tid", { tid: template.id })
          .andWhere("b.is_closed = false")
          .orderBy("b.batch_number", "DESC")
          .setLock("pessimistic_write")
          .getOne();

        if (!batch) {
          // Create batch #1 or next batch number based on max existing.
          const maxRow = await qr.manager
            .getRepository(ProgressWorkflowBatch)
            .createQueryBuilder("b")
            .select("MAX(b.batch_number)", "max")
            .where("b.template_id = :tid", { tid: template.id })
            .getRawOne<{ max: string | null }>();
          const nextNumber = (maxRow?.max ? Number(maxRow.max) : 0) + 1;

          const batchRepo = qr.manager.getRepository(ProgressWorkflowBatch);
          const createdBatch = batchRepo.create({
            template_id: template.id,
            batch_number: nextNumber,
            batch_parts: batchParts,
            batch_part_amount: partAmount,
            allocated_parts: 0,
            is_closed: false,
            created_by:
              params.currentUser?.id === -1 ? null : params.currentUser,
            updated_by:
              params.currentUser?.id === -1 ? null : params.currentUser,
          } as any);
          const saved = await batchRepo.save(createdBatch as any);
          const savedBatch = Array.isArray(saved) ? saved[0] : saved;
          // Lock newly created row (paranoia for consistency in loop)
          batch = await qr.manager
            .getRepository(ProgressWorkflowBatch)
            .createQueryBuilder("b")
            .where("b.id = :id", { id: savedBatch.id })
            .setLock("pessimistic_write")
            .getOneOrFail();
        }

        const available = Math.max(
          0,
          Number(batch.batch_parts) - Number(batch.allocated_parts),
        );
        if (available <= 0) {
          await qr.manager
            .getRepository(ProgressWorkflowBatch)
            .update(batch.id, {
              is_closed: true,
              updated_by:
                params.currentUser?.id === -1 ? null : params.currentUser,
            } as any);
          continue;
        }

        const take = Math.min(remaining, available);
        const partStart = Number(batch.allocated_parts) + 1;
        const partEnd = partStart + take - 1;

        const newAllocated = Number(batch.allocated_parts) + take;
        const closeNow = newAllocated >= Number(batch.batch_parts);
        await qr.manager.getRepository(ProgressWorkflowBatch).update(batch.id, {
          allocated_parts: newAllocated,
          is_closed: closeNow ? true : batch.is_closed,
          updated_by: params.currentUser?.id === -1 ? null : params.currentUser,
        } as any);

        const allocationRepo = qr.manager.getRepository(
          DonationBatchAllocation,
        );
        const createdAllocation = allocationRepo.create({
          donation_id: params.donation_id,
          template_id: template.id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          part_start: partStart,
          part_end: partEnd,
          parts_count: take,
          part_amount: partAmount,
          total_amount: take * partAmount,
          created_by: params.currentUser?.id === -1 ? null : params.currentUser,
          updated_by: params.currentUser?.id === -1 ? null : params.currentUser,
        } as any);
        const allocationSaved = await allocationRepo.save(
          createdAllocation as any,
        );
        const allocation = Array.isArray(allocationSaved)
          ? allocationSaved[0]
          : allocationSaved;

        results.push(allocation);
        remaining -= take;
      }

      await qr.commitTransaction();
      return results;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}
