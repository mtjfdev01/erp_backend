import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CsrPoc } from "./entities/csr-poc.entity";
import { Organization } from "./entities/organization.entity";
import { OrganizationBranch } from "./entities/organization-branch.entity";
import { DonorOrganizationAffiliation } from "./entities/donor-organization-affiliation.entity";
import { Donor, DonorType } from "../donor/entities/donor.entity";
import { CreateCsrPocDto } from "./dto/create-csr-poc.dto";
import { UpdateCsrPocDto } from "./dto/update-csr-poc.dto";
import { OrganizationAffiliationRole } from "./entities/donor-organization-affiliation.entity";

export interface CsrPocListParams {
  csr_donor_id?: number;
  search?: string;
  role?: string;
  branch_id?: number;
  is_primary?: boolean;
  is_active?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CsrPocsService implements OnModuleInit {
  private readonly logger = new Logger(CsrPocsService.name);

  constructor(
    @InjectRepository(CsrPoc)
    private readonly pocRepo: Repository<CsrPoc>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationBranch)
    private readonly branchRepo: Repository<OrganizationBranch>,
    @InjectRepository(DonorOrganizationAffiliation)
    private readonly affiliationRepo: Repository<DonorOrganizationAffiliation>,
    @InjectRepository(Donor)
    private readonly donorRepo: Repository<Donor>,
  ) {}

  /** One-time idempotent copy: donor_type=csr → csr_pocs (keeps legacy donor rows). */
  async onModuleInit(): Promise<void> {
    try {
      const migrated = await this.migrateLegacyCsrDonorsToPocs();
      if (migrated > 0) {
        this.logger.log(`Migrated ${migrated} legacy CSR donor row(s) to csr_pocs`);
      }
    } catch (err) {
      this.logger.warn(
        `Legacy CSR POC migration skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async migrateLegacyCsrDonorsToPocs(): Promise<number> {
    const legacyDonors = await this.donorRepo.find({
      where: { donor_type: DonorType.CSR, is_archived: false },
    });
    let count = 0;

    for (const donor of legacyDonors) {
      const exists = await this.pocRepo.findOne({
        where: { legacy_donor_id: donor.id },
      });
      if (exists) continue;

      const affiliation = await this.affiliationRepo.findOne({
        where: { donor_id: donor.id, is_archived: false },
        order: { is_primary: "DESC", id: "DESC" },
      });

      if (!affiliation?.organization_id) continue;

      const poc = this.pocRepo.create({
        csr_donor_id: affiliation.organization_id,
        name:
          donor.name ||
          [donor.first_name, donor.last_name].filter(Boolean).join(" ") ||
          donor.email ||
          `POC #${donor.id}`,
        email: donor.email,
        phone: donor.phone,
        cnic: donor.cnic,
        business_type: donor.business_type,
        business_type_other: donor.business_type_other,
        area_of_interest: donor.area_of_interest,
        branch_id: affiliation.branch_id,
        role: affiliation.role || OrganizationAffiliationRole.CONTACT,
        is_primary: affiliation.is_primary,
        notes: affiliation.notes,
        legacy_donor_id: donor.id,
        is_active: donor.is_active !== false,
      });
      await this.pocRepo.save(poc);
      count += 1;
    }

    return count;
  }

  private async validateBranch(
    csrDonorId: number,
    branchId?: number | null,
  ): Promise<void> {
    if (branchId == null) return;
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, organization_id: csrDonorId, is_archived: false },
    });
    if (!branch) {
      throw new BadRequestException(
        "Branch does not belong to this CSR donor",
      );
    }
  }

  private async clearOtherPrimary(csrDonorId: number, exceptId?: number) {
    const qb = this.pocRepo
      .createQueryBuilder()
      .update(CsrPoc)
      .set({ is_primary: false })
      .where("csr_donor_id = :csrDonorId", { csrDonorId })
      .andWhere("is_archived = false")
      .andWhere("is_primary = true");
    if (exceptId) {
      qb.andWhere("id != :exceptId", { exceptId });
    }
    await qb.execute();
  }

  async create(dto: CreateCsrPocDto, user?: any): Promise<CsrPoc> {
    await this.orgRepo.findOneOrFail({
      where: { id: dto.csr_donor_id, is_archived: false },
    });
    await this.validateBranch(dto.csr_donor_id, dto.branch_id);

    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phone?.trim() || null;
    if (!email && !phone) {
      throw new BadRequestException("Either email or phone is required for POC");
    }

    if (dto.is_primary) {
      await this.clearOtherPrimary(dto.csr_donor_id);
    }

    const auditUserId = user?.id && user.id !== -1 ? user.id : null;
    const poc = this.pocRepo.create({
      csr_donor_id: dto.csr_donor_id,
      name: dto.name.trim(),
      email,
      phone,
      cnic: dto.cnic?.trim() || null,
      business_type: dto.business_type?.trim() || null,
      business_type_other: dto.business_type_other?.trim() || null,
      area_of_interest: dto.area_of_interest?.trim() || null,
      branch_id: dto.branch_id ?? null,
      role: dto.role || OrganizationAffiliationRole.CONTACT,
      is_primary: dto.is_primary === true,
      notes: dto.notes?.trim() || null,
      is_active: dto.is_active !== false,
      ...(auditUserId != null ? { created_by: { id: auditUserId } as any } : {}),
    });

    return this.pocRepo.save(poc);
  }

  async findAll(params: CsrPocListParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(params.pageSize) || (params.csr_donor_id ? 100 : 20)),
    );

    const qb = this.pocRepo
      .createQueryBuilder("poc")
      .leftJoinAndSelect("poc.branch", "branch")
      .leftJoinAndSelect("poc.legacy_donor", "legacy_donor")
      .leftJoinAndSelect("poc.csr_donor", "csr_donor")
      .where("poc.is_archived = false");

    if (params.csr_donor_id) {
      qb.andWhere("poc.csr_donor_id = :csrDonorId", {
        csrDonorId: params.csr_donor_id,
      });
    }

    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      qb.andWhere(
        `(LOWER(poc.name) LIKE LOWER(:term)
          OR LOWER(COALESCE(poc.email, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(poc.phone, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(poc.cnic, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(csr_donor.name, '')) LIKE LOWER(:term))`,
        { term },
      );
    }

    if (params.role?.trim()) {
      qb.andWhere("poc.role = :role", { role: params.role.trim() });
    }

    if (params.branch_id) {
      qb.andWhere("poc.branch_id = :branchId", { branchId: params.branch_id });
    }

    if (params.is_primary === true || params.is_primary === false) {
      qb.andWhere("poc.is_primary = :isPrimary", {
        isPrimary: params.is_primary,
      });
    }

    if (params.is_active === true || params.is_active === false) {
      qb.andWhere("poc.is_active = :isActive", { isActive: params.is_active });
    }

    qb.orderBy("poc.is_primary", "DESC")
      .addOrderBy("poc.name", "ASC")
      .addOrderBy("poc.id", "ASC");

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

  async findByCsrDonor(
    csrDonorId: number,
    params: Omit<CsrPocListParams, "csr_donor_id"> = {},
  ): Promise<CsrPoc[]> {
    const result = await this.findAll({
      ...params,
      csr_donor_id: csrDonorId,
      page: params.page || 1,
      pageSize: params.pageSize || 200,
    });
    return result.data;
  }

  async findOne(id: number): Promise<CsrPoc> {
    const row = await this.pocRepo.findOne({
      where: { id, is_archived: false },
      relations: ["csr_donor", "branch", "legacy_donor"],
    });
    if (!row) {
      throw new NotFoundException(`POC with ID ${id} not found`);
    }
    return row;
  }

  async update(id: number, dto: UpdateCsrPocDto, user?: any): Promise<CsrPoc> {
    const poc = await this.findOne(id);

    if (dto.branch_id !== undefined) {
      await this.validateBranch(poc.csr_donor_id, dto.branch_id);
    }

    if (dto.is_primary === true) {
      await this.clearOtherPrimary(poc.csr_donor_id, id);
    }

    const auditUserId = user?.id && user.id !== -1 ? user.id : null;
    Object.assign(poc, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.email !== undefined
        ? { email: dto.email ? String(dto.email).trim().toLowerCase() : null }
        : {}),
      ...(dto.phone !== undefined
        ? { phone: dto.phone ? String(dto.phone).trim() : null }
        : {}),
      ...(dto.cnic !== undefined ? { cnic: dto.cnic } : {}),
      ...(dto.business_type !== undefined ? { business_type: dto.business_type } : {}),
      ...(dto.business_type_other !== undefined
        ? { business_type_other: dto.business_type_other }
        : {}),
      ...(dto.area_of_interest !== undefined
        ? { area_of_interest: dto.area_of_interest }
        : {}),
      ...(dto.branch_id !== undefined ? { branch_id: dto.branch_id } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.is_primary !== undefined ? { is_primary: dto.is_primary } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      ...(auditUserId != null ? { updated_by: { id: auditUserId } as any } : {}),
    });

    if (!poc.email && !poc.phone) {
      throw new BadRequestException("Either email or phone is required for POC");
    }

    return this.pocRepo.save(poc);
  }

  async softDelete(id: number): Promise<void> {
    const poc = await this.findOne(id);
    poc.is_archived = true;
    await this.pocRepo.save(poc);
  }

  /** Shape for CSR donor view people list. */
  mapPocForPeopleList(poc: CsrPoc) {
    return {
      poc_id: poc.id,
      affiliation_id: poc.id,
      role: poc.role,
      is_primary: poc.is_primary,
      notes: poc.notes,
      branch_id: poc.branch_id,
      branch: poc.branch
        ? {
            id: poc.branch.id,
            name: poc.branch.name,
            parent_branch_id: poc.branch.parent_branch_id,
          }
        : null,
      poc: {
        id: poc.id,
        name: poc.name,
        email: poc.email,
        phone: poc.phone,
        cnic: poc.cnic,
        role: poc.role,
        is_primary: poc.is_primary,
        business_type: poc.business_type,
        business_type_other: poc.business_type_other,
        area_of_interest: poc.area_of_interest,
        legacy_donor_id: poc.legacy_donor_id,
        is_active: poc.is_active,
      },
      legacy_donor_id: poc.legacy_donor_id,
      csr_donor_id: poc.csr_donor_id,
      csr_donor: poc.csr_donor
        ? {
            id: poc.csr_donor.id,
            name: poc.csr_donor.name,
            city: poc.csr_donor.city,
            phone: poc.csr_donor.phone,
          }
        : null,
    };
  }
}
