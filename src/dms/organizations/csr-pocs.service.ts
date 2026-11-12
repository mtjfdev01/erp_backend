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
import { CreateCsrPocDto } from "./dto/create-csr-poc.dto";
import { UpdateCsrPocDto } from "./dto/update-csr-poc.dto";
import { Organization } from "./entities/organization.entity";
import { OrganizationBranch } from "./entities/organization-branch.entity";
import {
  DonorOrganizationAffiliation,
  OrganizationAffiliationRole,
} from "./entities/donor-organization-affiliation.entity";
import { Donor, DonorType } from "../donor/entities/donor.entity";
import { DonationBox } from "../donation_box/entities/donation-box.entity";
import { DataScopeService } from "../../permissions/data-scope/data-scope.service";
import { ResolvedDataScope } from "../../permissions/data-scope/data-scope.types";
import {
  LOOKUP_PROFILES,
  listEntityLookup,
  type EntityLookupParams,
  type LookupOption,
} from "../../utils/lookup";

export interface CsrPocListParams {
  type?: string;
  csr_donor_id?: number;
  donation_box_id?: number;
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
    private readonly dataScopeService: DataScopeService,
  ) {}

  async listForLookup(params?: EntityLookupParams): Promise<LookupOption[]> {
    return listEntityLookup(
      this.pocRepo,
      {
        profile: LOOKUP_PROFILES.csr_pocs,
        searchFields: ["name", "email", "phone"],
        activeColumn: "is_active",
        labelFallback: (row) => `POC #${row.id}`,
      },
      params,
    );
  }

  async resolveOrganizationScope(currentUser?: {
    id?: number;
    role?: string;
    department?: string;
  }): Promise<ResolvedDataScope> {
    return this.dataScopeService.resolveScope(
      currentUser?.id,
      currentUser?.role,
      currentUser?.department,
      "fund_raising",
      "organizations",
    );
  }

  assertOrganizationRecordAccess(
    scope: ResolvedDataScope,
    record: Organization,
  ): void {
    this.dataScopeService.assertRecordAccess(scope, record);
  }

  async assertPocOrganizationAccess(
    poc: CsrPoc,
    currentUser?: { id?: number; role?: string; department?: string },
  ): Promise<void> {
    if (!currentUser?.id) return;
    if (poc.csr_donor_id) {
      await this.assertCsrDonorIdAccess(poc.csr_donor_id, currentUser);
    }
  }

  async assertCsrDonorIdAccess(
    csrDonorId?: number | null,
    currentUser?: { id?: number; role?: string; department?: string },
  ): Promise<Organization | null> {
    if (!csrDonorId) return null;
    const org = await this.orgRepo.findOne({
      where: { id: csrDonorId, is_archived: false },
      relations: ["created_by"],
    });
    if (!org) {
      throw new NotFoundException(`CSR donor ${csrDonorId} not found`);
    }
    if (currentUser?.id) {
      const scope = await this.resolveOrganizationScope(currentUser);
      this.assertOrganizationRecordAccess(scope, org);
    }
    return org;
  }

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

    try {
      await this.pocRepo.query(`
        INSERT INTO csr_pocs (donation_box_id, type, name, phone, role, is_primary, is_active, created_at, updated_at)
        SELECT 
          b.id,
          CASE WHEN b.type = 'Mosques' THEN 'Mosques' ELSE 'Donation Boxes' END,
          COALESCE(NULLIF(TRIM(b.shopkeeper), ''), NULLIF(TRIM(b.name), ''), NULLIF(TRIM(b.shop_name), ''), 'Contact Person'),
          NULLIF(TRIM(b.cell_no), ''),
          'contact',
          true,
          true,
          NOW(),
          NOW()
        FROM donation_boxes b
        WHERE b.is_archived = false
          AND NOT EXISTS (
            SELECT 1 FROM csr_pocs p 
            WHERE p.donation_box_id = b.id 
              AND p.is_archived = false
          );
      `);
    } catch (err: any) {
      this.logger.warn(`Collection Units POC backfill query check: ${err?.message}`);
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
    csrDonorId?: number | null,
    branchId?: number | null,
  ): Promise<void> {
    if (branchId == null || !csrDonorId) return;
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, organization_id: csrDonorId, is_archived: false },
    });
    if (!branch) {
      throw new BadRequestException(
        "Branch does not belong to this CSR donor",
      );
    }
  }

  private async clearOtherPrimary(csrDonorId?: number | null, exceptId?: number) {
    if (!csrDonorId) return;
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
    if (dto.csr_donor_id) {
      await this.orgRepo.findOneOrFail({
        where: { id: dto.csr_donor_id, is_archived: false },
      });
      await this.validateBranch(dto.csr_donor_id, dto.branch_id);
    }

    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phone?.trim() || null;
    if (!email && !phone) {
      throw new BadRequestException("Either email or phone is required for POC");
    }

    if (dto.is_primary && dto.csr_donor_id) {
      await this.clearOtherPrimary(dto.csr_donor_id);
    }

    const auditUserId = user?.id && user.id !== -1 ? user.id : null;
    const pocType = dto.type || (dto.donation_box_id ? "Donation Boxes" : "Corporate Donors");

    const poc = this.pocRepo.create({
      type: pocType,
      csr_donor_id: dto.csr_donor_id ?? null,
      donation_box_id: dto.donation_box_id ?? null,
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

  async findAll(
    params: CsrPocListParams = {},
    currentUser?: { id?: number; role?: string; department?: string },
  ) {
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
      .leftJoinAndSelect("csr_donor.created_by", "csr_donor_created_by")
      .leftJoinAndSelect("poc.donation_box", "donation_box")
      .leftJoinAndSelect("donation_box.route", "donation_box_route")
      .where("poc.is_archived = false");

    if (params.type && params.type !== "all" && params.type !== "All") {
      qb.andWhere("poc.type = :pocType", { pocType: params.type });
    }

    if (params.donation_box_id) {
      qb.andWhere("poc.donation_box_id = :donationBoxId", {
        donationBoxId: params.donation_box_id,
      });
    }

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
          OR LOWER(COALESCE(csr_donor.name, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(donation_box.name, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(donation_box.shop_name, '')) LIKE LOWER(:term)
          OR LOWER(COALESCE(donation_box_route.name, '')) LIKE LOWER(:term))`,
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

    // Scope POCs by parent CSR donor ownership only if corporate donor
    if (currentUser?.id && (!params.type || params.type === "Corporate Donors") && params.csr_donor_id) {
      const scope = await this.resolveOrganizationScope(currentUser);
      this.dataScopeService.applyToQuery(qb, "csr_donor", scope);
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

  async findByDonationBox(donationBoxId: number): Promise<CsrPoc | null> {
    return this.pocRepo.findOne({
      where: { donation_box_id: donationBoxId, is_archived: false },
      order: { is_primary: "DESC", id: "ASC" },
      relations: ["donation_box", "donation_box.route"],
    });
  }

  async syncFromDonationBox(box: DonationBox): Promise<CsrPoc | null> {
    if (!box?.id) return null;
    const pocType = box.type === "Mosques" ? "Mosques" : "Donation Boxes";
    const pocName = (box.shopkeeper?.trim() || box.name?.trim() || box.shop_name?.trim() || "Contact Person");
    const pocPhone = box.cell_no?.trim() || null;

    let poc = await this.pocRepo.findOne({
      where: { donation_box_id: box.id, is_archived: false },
      order: { is_primary: "DESC", id: "ASC" },
    });

    if (poc) {
      poc.name = pocName;
      poc.phone = pocPhone;
      poc.type = pocType;
      return this.pocRepo.save(poc);
    } else {
      poc = this.pocRepo.create({
        donation_box_id: box.id,
        type: pocType,
        name: pocName,
        phone: pocPhone,
        role: "contact",
        is_primary: true,
        is_active: true,
      });
      return this.pocRepo.save(poc);
    }
  }

  async findOne(id: number): Promise<CsrPoc> {
    const row = await this.pocRepo.findOne({
      where: { id, is_archived: false },
      relations: [
        "csr_donor",
        "csr_donor.created_by",
        "branch",
        "legacy_donor",
        "donation_box",
        "donation_box.route",
      ],
    });
    if (!row) {
      throw new NotFoundException(`POC with ID ${id} not found`);
    }
    return row;
  }

  async update(id: number, dto: UpdateCsrPocDto, user?: any): Promise<CsrPoc> {
    const poc = await this.findOne(id);

    if (dto.branch_id !== undefined && poc.csr_donor_id) {
      await this.validateBranch(poc.csr_donor_id, dto.branch_id);
    }

    if (dto.is_primary === true && poc.csr_donor_id) {
      await this.clearOtherPrimary(poc.csr_donor_id, id);
    }

    const auditUserId = user?.id && user.id !== -1 ? user.id : null;
    Object.assign(poc, {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.donation_box_id !== undefined ? { donation_box_id: dto.donation_box_id } : {}),
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
        type: poc.type,
        donation_box_id: poc.donation_box_id,
        donation_box: poc.donation_box
          ? {
              id: poc.donation_box.id,
              name: poc.donation_box.name || poc.donation_box.shop_name,
              key_no: poc.donation_box.key_no,
              type: poc.donation_box.type,
              route: poc.donation_box.route
                ? {
                    id: poc.donation_box.route.id,
                    name: poc.donation_box.route.name,
                  }
                : null,
            }
          : null,
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
      type: poc.type,
      donation_box_id: poc.donation_box_id,
      donation_box: poc.donation_box
        ? {
            id: poc.donation_box.id,
            name: poc.donation_box.name || poc.donation_box.shop_name,
            key_no: poc.donation_box.key_no,
            type: poc.donation_box.type,
            route: poc.donation_box.route
              ? {
                  id: poc.donation_box.route.id,
                  name: poc.donation_box.route.name,
                }
              : null,
          }
        : null,
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
