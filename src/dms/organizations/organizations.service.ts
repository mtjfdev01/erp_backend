import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { Organization } from "./entities/organization.entity";
import { OrganizationBranch } from "./entities/organization-branch.entity";
import {
  DonorOrganizationAffiliation,
  OrganizationAffiliationRole,
} from "./entities/donor-organization-affiliation.entity";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { CreateAffiliationDto } from "./dto/create-affiliation.dto";
import { CreateOrganizationBranchDto } from "./dto/create-organization-branch.dto";
import { UpdateOrganizationBranchDto } from "./dto/update-organization-branch.dto";
import { Donor } from "../donor/entities/donor.entity";
import { CsrPocsService, CsrPocListParams } from "./csr-pocs.service";
import { CsrDonorPipelineStageHistory } from "./pipeline/entities/csr-donor-pipeline-stage-history.entity";
import { ChangePipelineStageDto } from "../donor/dto/change-pipeline-stage.dto";
import {
  DonorPipelineStage,
  resolveDonorPipelineStage,
} from "../donor/pipeline/donor-pipeline.constants";
import { CsrDonorAuditService } from "./audit/csr-donor-audit.service";
import {
  buildCsrDonorFieldChanges,
  csrDonorAuditSnapshot,
} from "./audit/csr-donor-audit.util";
import { DonorAuditAction } from "../donor/audit/donor-audit-action.enum";
import { DonorAuditSource } from "../donor/audit/donor-audit-source.enum";

export type OrganizationBranchTreeNode = OrganizationBranch & {
  sub_branches: OrganizationBranch[];
};

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationBranch)
    private readonly branchRepo: Repository<OrganizationBranch>,
    @InjectRepository(DonorOrganizationAffiliation)
    private readonly affiliationRepo: Repository<DonorOrganizationAffiliation>,
    @InjectRepository(Donor)
    private readonly donorRepo: Repository<Donor>,
    @InjectRepository(CsrDonorPipelineStageHistory)
    private readonly pipelineHistoryRepo: Repository<CsrDonorPipelineStageHistory>,
    private readonly csrPocsService: CsrPocsService,
    private readonly csrDonorAuditService: CsrDonorAuditService,
  ) {}

  private auditUserId(userId?: number | null): number | null {
    return userId && userId !== -1 ? userId : null;
  }

  private withEffectivePipelineStage<T extends Organization>(
    org: T,
  ): T & { effective_pipeline_stage: DonorPipelineStage } {
    return {
      ...org,
      effective_pipeline_stage: resolveDonorPipelineStage(org.pipeline_stage),
    };
  }

  async create(dto: CreateOrganizationDto, user?: any): Promise<Organization> {
    const auditId = user?.id && user.id !== -1 ? user.id : null;
    const org = this.orgRepo.create({
      name: dto.name.trim(),
      registration_number: dto.registration_number?.trim() || null,
      email: dto.email?.trim() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      city: dto.city?.trim() || null,
      country: dto.country?.trim() || null,
      notes: dto.notes?.trim() || null,
      parent_organization_id: dto.parent_organization_id ?? null,
      is_active: dto.is_active !== false,
      ...(auditId != null ? { created_by: { id: auditId } as any } : {}),
    });
    return this.orgRepo.save(org);
  }

  async findAll(params: {
    search?: string;
    page?: number;
    pageSize?: number;
    is_active?: boolean;
    city?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const qb = this.orgRepo
      .createQueryBuilder("org")
      .where("org.is_archived = false")
      .orderBy("org.name", "ASC");

    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      qb.andWhere(
        `(LOWER(org.name) LIKE LOWER(:term)
          OR LOWER(COALESCE(org.registration_number, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(org.city, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(org.email, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(org.phone, '')) LIKE LOWER(:term))`,
        { term },
      );
    }

    if (params.city?.trim()) {
      qb.andWhere("LOWER(org.city) = LOWER(:city)", {
        city: params.city.trim(),
      });
    }

    if (params.is_active === true || params.is_active === false) {
      qb.andWhere("org.is_active = :isActive", { isActive: params.is_active });
    }

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

  private buildBranchTree(
    branches: OrganizationBranch[],
  ): OrganizationBranchTreeNode[] {
    const active = (branches || []).filter((b) => !b.is_archived);
    const byParent = new Map<number | null, OrganizationBranch[]>();
    for (const b of active) {
      const key = b.parent_branch_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(b);
    }
    const roots = byParent.get(null) || [];
    return roots.map((root) => ({
      ...root,
      sub_branches: byParent.get(root.id) || [],
    }));
  }

  async findOne(id: number): Promise<
    Organization & { branch_tree: OrganizationBranchTreeNode[] }
  > {
    const org = await this.orgRepo.findOne({
      where: { id, is_archived: false },
      relations: ["branches", "parent_organization"],
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    const branch_tree = this.buildBranchTree(org.branches || []);
    return this.withEffectivePipelineStage(
      Object.assign(org, { branch_tree }),
    );
  }

  async update(id: number, dto: UpdateOrganizationDto, user?: any): Promise<Organization> {
    const org = await this.findOne(id);
    const before = csrDonorAuditSnapshot(org as any);
    Object.assign(org, {
      ...(dto.name != null ? { name: dto.name.trim() } : {}),
      ...(dto.registration_number !== undefined
        ? { registration_number: dto.registration_number?.trim() || null }
        : {}),
      ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
      ...(dto.address !== undefined
        ? { address: dto.address?.trim() || null }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
      ...(dto.country !== undefined
        ? { country: dto.country?.trim() || null }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      ...(dto.parent_organization_id !== undefined
        ? { parent_organization_id: dto.parent_organization_id }
        : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    });
    const { branch_tree: _t, effective_pipeline_stage: _e, ...toSave } = org as any;
    const saved = await this.orgRepo.save(toSave);
    const patchForAudit: Record<string, unknown> = {};
    for (const key of Object.keys(dto)) {
      if (dto[key as keyof UpdateOrganizationDto] !== undefined) {
        patchForAudit[key] = (saved as any)[key];
      }
    }
    const auditUserId = this.auditUserId(user?.id);
    const auditChanges = buildCsrDonorFieldChanges(before, patchForAudit);
    if (auditChanges.length > 0) {
      await this.csrDonorAuditService.log({
        csrDonorId: id,
        action: DonorAuditAction.UPDATED,
        source: DonorAuditSource.STAFF_UI,
        changes: auditChanges,
        performedByUserId: auditUserId,
      });
    }
    return this.findOne(id);
  }

  async softDelete(id: number): Promise<void> {
    const org = await this.orgRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    org.is_archived = true;
    org.is_active = false;
    await this.orgRepo.save(org);
  }

  async createBranch(
    organizationId: number,
    dto: CreateOrganizationBranchDto,
  ): Promise<OrganizationBranch> {
    await this.findOne(organizationId);
    if (!dto?.name?.trim()) {
      throw new BadRequestException("Branch name is required");
    }

    let parentBranchId: number | null = null;
    if (dto.parent_branch_id) {
      const parent = await this.branchRepo.findOne({
        where: {
          id: dto.parent_branch_id,
          organization_id: organizationId,
          is_archived: false,
        },
      });
      if (!parent) {
        throw new BadRequestException(
          "Parent branch not found on this organization",
        );
      }
      if (parent.parent_branch_id != null) {
        throw new BadRequestException(
          "Sub-branches can only be created under a top-level branch (Organization → Branch → Sub-branch)",
        );
      }
      parentBranchId = parent.id;
    }

    const branch = this.branchRepo.create({
      organization_id: organizationId,
      parent_branch_id: parentBranchId,
      name: dto.name.trim(),
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      address: dto.address?.trim() || null,
      city: dto.city?.trim() || null,
      country: dto.country?.trim() || null,
      is_active: dto.is_active !== false,
    });
    return this.branchRepo.save(branch);
  }

  async updateBranch(
    organizationId: number,
    branchId: number,
    dto: UpdateOrganizationBranchDto,
  ): Promise<OrganizationBranch> {
    const branch = await this.branchRepo.findOne({
      where: {
        id: branchId,
        organization_id: organizationId,
        is_archived: false,
      },
    });
    if (!branch) throw new NotFoundException("Branch not found");

    if (dto.parent_branch_id !== undefined) {
      if (dto.parent_branch_id === null || dto.parent_branch_id === ("" as any)) {
        branch.parent_branch_id = null;
      } else {
        const parentId = Number(dto.parent_branch_id);
        if (parentId === branch.id) {
          throw new BadRequestException("Branch cannot be its own parent");
        }
        const parent = await this.branchRepo.findOne({
          where: {
            id: parentId,
            organization_id: organizationId,
            is_archived: false,
          },
        });
        if (!parent) {
          throw new BadRequestException("Parent branch not found");
        }
        if (parent.parent_branch_id != null) {
          throw new BadRequestException(
            "Cannot nest under a sub-branch (max depth: Organization → Branch → Sub-branch)",
          );
        }
        if (branch.parent_branch_id == null) {
          const hasChildren = await this.branchRepo.count({
            where: {
              parent_branch_id: branch.id,
              is_archived: false,
            },
          });
          if (hasChildren > 0) {
            throw new BadRequestException(
              "Cannot demote a branch that already has sub-branches",
            );
          }
        }
        branch.parent_branch_id = parentId;
      }
    }

    if (dto.name != null) branch.name = dto.name.trim();
    if (dto.phone !== undefined) branch.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) branch.email = dto.email?.trim() || null;
    if (dto.address !== undefined) branch.address = dto.address?.trim() || null;
    if (dto.city !== undefined) branch.city = dto.city?.trim() || null;
    if (dto.country !== undefined) branch.country = dto.country?.trim() || null;
    if (dto.is_active !== undefined) branch.is_active = dto.is_active;

    return this.branchRepo.save(branch);
  }

  async softDeleteBranch(
    organizationId: number,
    branchId: number,
  ): Promise<void> {
    const branch = await this.branchRepo.findOne({
      where: {
        id: branchId,
        organization_id: organizationId,
        is_archived: false,
      },
    });
    if (!branch) throw new NotFoundException("Branch not found");

    const children = await this.branchRepo.find({
      where: { parent_branch_id: branchId, is_archived: false },
    });
    for (const child of children) {
      child.is_archived = true;
      child.is_active = false;
      await this.branchRepo.save(child);
    }
    branch.is_archived = true;
    branch.is_active = false;
    await this.branchRepo.save(branch);
  }

  async createAffiliation(
    dto: CreateAffiliationDto,
  ): Promise<DonorOrganizationAffiliation> {
    const donor = await this.donorRepo.findOne({ where: { id: dto.donor_id } });
    if (!donor) throw new NotFoundException("Donor not found");

    const org = await this.findOne(dto.organization_id);

    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branch_id, organization_id: org.id, is_archived: false },
      });
      if (!branch) {
        throw new BadRequestException(
          "Branch does not belong to this organization",
        );
      }
    }

    if (dto.is_primary) {
      await this.affiliationRepo.update(
        { donor_id: dto.donor_id, is_primary: true },
        { is_primary: false },
      );
    }

    const existing = await this.affiliationRepo.findOne({
      where: {
        donor_id: dto.donor_id,
        organization_id: dto.organization_id,
        branch_id: dto.branch_id != null ? dto.branch_id : IsNull(),
        is_archived: false,
      },
    });
    if (existing) {
      existing.role = dto.role || existing.role;
      existing.is_primary =
        dto.is_primary !== undefined ? !!dto.is_primary : existing.is_primary;
      if (dto.notes !== undefined) existing.notes = dto.notes?.trim() || null;
      if (dto.branch_id !== undefined) existing.branch_id = dto.branch_id ?? null;
      return this.affiliationRepo.save(existing);
    }

    const affiliation = this.affiliationRepo.create({
      donor_id: dto.donor_id,
      organization_id: dto.organization_id,
      branch_id: dto.branch_id ?? null,
      role: dto.role || OrganizationAffiliationRole.CONTACT,
      is_primary: !!dto.is_primary,
      notes: dto.notes?.trim() || null,
    });
    return this.affiliationRepo.save(affiliation);
  }

  async listAffiliationsForDonor(donorId: number) {
    return this.affiliationRepo.find({
      where: { donor_id: donorId, is_archived: false },
      relations: ["organization", "branch"],
      order: { is_primary: "DESC", id: "DESC" },
    });
  }

  /**
   * POC contacts linked to this CSR donor (csr_pocs table).
   */
  async listPeopleForOrganization(
    organizationId: number,
    params: Omit<CsrPocListParams, "csr_donor_id"> = {},
  ) {
    await this.findOne(organizationId);
    const result = await this.csrPocsService.findAll({
      ...params,
      csr_donor_id: organizationId,
      page: params.page || 1,
      pageSize: params.pageSize || 200,
    });
    return result.data.map((row) => this.csrPocsService.mapPocForPeopleList(row));
  }

  /**
   * Ensure an organization exists from a company/org name (import / create helpers).
   */
  async findOrCreateFromCompanyFields(fields: {
    company_name?: string;
    company_registration?: string;
    company_email?: string;
    company_phone?: string;
    company_address?: string;
    city?: string;
    country?: string;
  }): Promise<Organization | null> {
    const name = fields.company_name?.trim();
    if (!name) return null;

    const existing = await this.orgRepo
      .createQueryBuilder("org")
      .where("org.is_archived = false")
      .andWhere("LOWER(org.name) = LOWER(:name)", { name })
      .getOne();
    if (existing) return existing;

    return this.create({
      name,
      registration_number: fields.company_registration,
      email: fields.company_email,
      phone: fields.company_phone,
      address: fields.company_address,
      city: fields.city,
      country: fields.country,
    });
  }

  async getPipelineHistory(csrDonorId: number) {
    await this.findOne(csrDonorId);
    return this.pipelineHistoryRepo.find({
      where: { csr_donor_id: csrDonorId },
      relations: ["changed_by"],
      order: { created_at: "DESC", id: "DESC" },
    });
  }

  async getAuditHistory(csrDonorId: number) {
    await this.findOne(csrDonorId);
    return this.csrDonorAuditService.findByCsrDonorId(csrDonorId);
  }

  async changePipelineStage(
    id: number,
    dto: ChangePipelineStageDto,
    user?: any,
  ) {
    const reason = String(dto.reason || "").trim();
    if (reason.length < 3) {
      throw new BadRequestException("Reason must be at least 3 characters");
    }

    const org = await this.orgRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }

    const fromStage = resolveDonorPipelineStage(org.pipeline_stage);
    const toStage = dto.stage;
    const isSame = fromStage === toStage;
    const transitionType =
      dto.transition_type || (isSame ? "noted" : "advanced");

    if (transitionType === "advanced" && isSame) {
      throw new BadRequestException(
        "Stage is unchanged. Use transition_type=noted to log why the contact did not progress.",
      );
    }

    const needsAmount =
      (toStage === DonorPipelineStage.ASK ||
        toStage === DonorPipelineStage.PLEDGE) &&
      transitionType === "advanced";

    const amountRaw = dto.amount;
    const amountNum =
      amountRaw === undefined || amountRaw === null || amountRaw === ("" as any)
        ? null
        : Number(amountRaw);

    if (needsAmount) {
      if (amountNum == null || !Number.isFinite(amountNum) || amountNum <= 0) {
        throw new BadRequestException(
          toStage === DonorPipelineStage.ASK
            ? "Ask amount is required when moving to Ask"
            : "Pledge amount is required when moving to Pledge",
        );
      }
    }

    const currency =
      String(dto.currency || org.pipeline_amount_currency || "PKR")
        .trim()
        .toUpperCase()
        .slice(0, 8) || "PKR";

    const auditUserId = this.auditUserId(user?.id);
    const before = csrDonorAuditSnapshot(org as any);
    const patchForAudit: Record<string, unknown> = {};

    if (transitionType === "advanced" || !org.pipeline_stage) {
      org.pipeline_stage = toStage;
      org.pipeline_stage_changed_at = new Date();
      org.pipeline_stage_changed_by_id = auditUserId;
      patchForAudit.pipeline_stage = toStage;

      if (amountNum != null && Number.isFinite(amountNum) && amountNum > 0) {
        org.pipeline_amount_currency = currency;
        patchForAudit.pipeline_amount_currency = currency;
        if (toStage === DonorPipelineStage.ASK) {
          org.pipeline_ask_amount = amountNum as any;
          patchForAudit.pipeline_ask_amount = amountNum;
        }
        if (toStage === DonorPipelineStage.PLEDGE) {
          org.pipeline_pledge_amount = amountNum as any;
          patchForAudit.pipeline_pledge_amount = amountNum;
        }
      }

      if (auditUserId != null) {
        org.updated_by = { id: auditUserId } as any;
      }
      await this.orgRepo.save(org);

      const auditChanges = buildCsrDonorFieldChanges(before, patchForAudit);
      if (auditChanges.length > 0) {
        await this.csrDonorAuditService.log({
          csrDonorId: id,
          action: DonorAuditAction.UPDATED,
          source: DonorAuditSource.STAFF_UI,
          changes: auditChanges,
          performedByUserId: auditUserId,
          metadata: {
            pipeline_reason: reason,
            transition_type: transitionType,
            amount: amountNum,
            currency,
          },
        });
      }
    } else if (
      amountNum != null &&
      Number.isFinite(amountNum) &&
      amountNum > 0 &&
      (toStage === DonorPipelineStage.ASK ||
        toStage === DonorPipelineStage.PLEDGE)
    ) {
      org.pipeline_amount_currency = currency;
      if (toStage === DonorPipelineStage.ASK) {
        org.pipeline_ask_amount = amountNum as any;
      }
      if (toStage === DonorPipelineStage.PLEDGE) {
        org.pipeline_pledge_amount = amountNum as any;
      }
      if (auditUserId != null) {
        org.updated_by = { id: auditUserId } as any;
      }
      await this.orgRepo.save(org);
    }

    const history = await this.pipelineHistoryRepo.save(
      this.pipelineHistoryRepo.create({
        csr_donor_id: id,
        from_stage: fromStage,
        to_stage: toStage,
        reason,
        transition_type: transitionType,
        amount:
          amountNum != null && Number.isFinite(amountNum) && amountNum > 0
            ? (amountNum as any)
            : null,
        currency:
          amountNum != null && Number.isFinite(amountNum) && amountNum > 0
            ? currency
            : null,
        changed_by_id: auditUserId,
      }),
    );

    const refreshed = await this.findOne(id);
    return {
      csr_donor: refreshed,
      history_entry: history,
    };
  }
}
