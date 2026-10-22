import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PermissionsService } from "../../permissions/permissions.service";
import { Department, User } from "../../users/user.entity";
import { UsersService } from "../../users/users.service";
import { S3StorageService } from "../../utils/storage/s3-storage.service";
import {
  AidApplicationStatus,
  AidAttachmentContext,
  AidCaseSource,
  AidCeoApprovalStatus,
  AidDeliveryStatus,
  AidRequestType,
  AidWriterRelation,
} from "./aid.enums";
import {
  AID_COOLDOWN_DAYS,
  AID_SUCCESS_STATUSES,
} from "./aid-leakage.constants";
import {
  assertInvestigationComplete,
  buildInvestigationItems,
  normalizeInvestigationEntry,
} from "./aid-verification-checklist";
import {
  computeVulnerabilityScore,
  extractAmountFromNote,
  vulnerabilityDeltas,
  type VulnerabilityInputs,
} from "./aid-vulnerability-score";
import { AidPeopleService } from "./aid-people.service";
import {
  ApproveDraftAidApplicationDto,
  CeoDecideAidApplicationDto,
  CreateAidApplicationDto,
  DeliverAidApplicationDto,
  RejectAidApplicationDto,
  UpdateAidApplicationDto,
  VerifyAidApplicationDto,
} from "./dto/aid.dto";
import { AidApplication } from "./entities/aid-application.entity";
import { AidAttachment } from "./entities/aid-attachment.entity";
import { AidHouseholdMember } from "./entities/aid-household-member.entity";
import { AidKinshipEdge } from "./entities/aid-kinship-edge.entity";
import { AidPerson } from "./entities/aid-person.entity";
import {
  LOOKUP_PROFILES,
  listEntityLookup,
  type EntityLookupParams,
  type LookupOption,
} from "../../utils/lookup";

@Injectable()
export class AidApplicationsService {
  constructor(
    @InjectRepository(AidApplication)
    private readonly appRepo: Repository<AidApplication>,
    @InjectRepository(AidAttachment)
    private readonly attachmentRepo: Repository<AidAttachment>,
    @InjectRepository(AidPerson)
    private readonly personRepo: Repository<AidPerson>,
    @InjectRepository(AidHouseholdMember)
    private readonly memberRepo: Repository<AidHouseholdMember>,
    private readonly peopleService: AidPeopleService,
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly s3: S3StorageService,
  ) {}

  /**
   * Investigation (checklist / verify / site-visit attach):
   * assigned investigator, super admin, or bulk_verify (Mark all complete).
   */
  private async assertCanPerformInvestigation(
    app: AidApplication,
    user?: User,
  ) {
    if (!user?.id) {
      throw new ForbiddenException("Authentication required");
    }
    if (Number(user.id) === -1) return;

    if (
      await this.permissionsService.hasPermission(Number(user.id), "super_admin")
    ) {
      return;
    }
    if (
      (await this.permissionsService.hasPermission(
        Number(user.id),
        "program.aid_verification.bulk_verify",
      )) ||
      (await this.permissionsService.hasPermission(
        Number(user.id),
        "program.aid_applications.bulk_verify",
      )) ||
      (await this.permissionsService.hasPermission(
        Number(user.id),
        "fund_raising.aid_verification.bulk_verify",
      )) ||
      (await this.permissionsService.hasPermission(
        Number(user.id),
        "fund_raising.aid_applications.bulk_verify",
      ))
    ) {
      return;
    }

    if (
      app.assigned_to_user_id != null &&
      Number(app.assigned_to_user_id) === Number(user.id)
    ) {
      return;
    }

    throw new ForbiddenException(
      "Only the assigned investigator, super admin, or users with Mark all complete may perform the investigation",
    );
  }

  private pickAuditActor(user: any) {
    if (!user || typeof user !== "object") return null;
    return {
      id: user.id,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      email: user.email || null,
    };
  }

  private async nextApplicationNo(): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `AID-${day}-`;
    const latest = await this.appRepo
      .createQueryBuilder("a")
      .where("a.application_no LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("a.application_no", "DESC")
      .getOne();
    let seq = 1;
    if (latest?.application_no) {
      const part = latest.application_no.split("-").pop();
      const n = Number(part);
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, "0")}`;
  }

  async create(dto: CreateAidApplicationDto, user?: User) {
    let beneficiaryId = dto.beneficiary_person_id;
    let writerId = dto.writer_person_id;

    if (dto.beneficiary && !beneficiaryId) {
      const b = await this.peopleService.create(dto.beneficiary, user);
      beneficiaryId = b.id;
    }
    if (dto.writer && !writerId) {
      const w = await this.peopleService.create(dto.writer, user);
      writerId = w.id;
    }
    if (!beneficiaryId) {
      throw new BadRequestException("beneficiary_person_id is required");
    }
    if (!writerId) {
      writerId = beneficiaryId;
    }

    await this.peopleService.findOne(beneficiaryId);
    await this.peopleService.findOne(writerId);

    const writerRelation =
      writerId === beneficiaryId
        ? AidWriterRelation.SELF
        : dto.writer_relation || AidWriterRelation.OTHER;

    const row = this.appRepo.create({
      application_no: await this.nextApplicationNo(),
      beneficiary_person_id: beneficiaryId,
      writer_person_id: writerId,
      writer_relation: writerRelation,
      household_id: dto.household_id ?? null,
      title: dto.title?.trim() || null,
      request_summary: dto.request_summary?.trim() || null,
      case_source: dto.case_source || AidCaseSource.WALK_IN,
      requested_aid_type: dto.requested_aid_type || AidRequestType.OTHER,
      aid_program: dto.aid_program?.trim() || null,
      expected_amount:
        dto.expected_amount != null && Number.isFinite(Number(dto.expected_amount))
          ? String(dto.expected_amount)
          : null,
      expected_amount_max:
        dto.expected_amount_max != null &&
        Number.isFinite(Number(dto.expected_amount_max))
          ? String(dto.expected_amount_max)
          : null,
      education_details:
        dto.requested_aid_type === AidRequestType.EDUCATION
          ? dto.education_details ?? null
          : null,
      ration_details:
        dto.requested_aid_type === AidRequestType.RATION
          ? dto.ration_details ?? null
          : null,
      marriage_gift_details:
        dto.requested_aid_type === AidRequestType.MARRIAGE_GIFT
          ? dto.marriage_gift_details ?? null
          : null,
      financial_assistance_details:
        dto.requested_aid_type === AidRequestType.FINANCIAL_ASSISTANCE
          ? dto.financial_assistance_details ?? null
          : null,
      clean_water_details:
        dto.requested_aid_type === AidRequestType.CLEAN_WATER
          ? dto.clean_water_details ?? null
          : null,
      zakat_permission: dto.zakat_permission ?? null,
      consent_form: dto.consent_form ?? null,
      status: AidApplicationStatus.DRAFT,
      ceo_approval_status: AidCeoApprovalStatus.NOT_REQUIRED,
      delivery_status: AidDeliveryStatus.NOT_STARTED,
      // Assignment is done by the draft approver (program user), not at intake
      assigned_to_user_id: null,
      submitted_at: null,
      created_by: user || null,
      updated_by: user || null,
    });
    const saved = await this.appRepo.save(row);

    for (const fm of dto.family_members || []) {
      if (!fm?.relation_type) continue;
      const hasPerson =
        fm.existing_person_id ||
        (fm.person && String(fm.person.full_name || "").trim());
      if (!hasPerson) continue;
      try {
        await this.peopleService.addFamilyMember(beneficiaryId, fm, user);
      } catch (err) {
        if (err instanceof ConflictException) continue;
        throw err;
      }
    }

    return this.findOne(saved.id);
  }

  /**
   * Pipeline stage for data-entry board (maps to AidApplicationStatus).
   */
  private applyStageFilter(
    qb: ReturnType<Repository<AidApplication>["createQueryBuilder"]>,
    stage?: string,
  ) {
    const s = String(stage || "").trim().toLowerCase();
    if (!s) return;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    switch (s) {
      case "draft":
        qb.andWhere("a.status = :st", { st: AidApplicationStatus.DRAFT });
        break;
      case "submitted":
        qb.andWhere("a.status = :st", { st: AidApplicationStatus.SUBMITTED });
        break;
      case "investigation":
        qb.andWhere("a.status = :st", {
          st: AidApplicationStatus.UNDER_REVIEW,
        });
        break;
      case "pending_approval":
        qb.andWhere("a.status = :st", {
          st: AidApplicationStatus.CEO_APPROVAL_REQUIRED,
        });
        break;
      case "approved":
        qb.andWhere("a.status IN (:...sts)", {
          sts: [
            AidApplicationStatus.SUCCESSFUL,
            AidApplicationStatus.DELIVERED,
          ],
        });
        qb.andWhere("a.updated_at >= :monthStart", { monthStart });
        break;
      case "returned":
        qb.andWhere("a.status = :st", { st: AidApplicationStatus.REJECTED });
        break;
      default:
        break;
    }
  }

  private applyListFilters(
    qb: ReturnType<Repository<AidApplication>["createQueryBuilder"]>,
    params: {
      search?: string;
      requested_aid_type?: string;
      district?: string;
      assigned_to_user_id?: number | string;
    },
  ) {
    const search = String(params.search || "").trim();
    if (search) {
      qb.andWhere(
        "(a.application_no ILIKE :q OR a.title ILIKE :q OR beneficiary.full_name ILIKE :q OR beneficiary.cnic ILIKE :q OR writer.full_name ILIKE :q OR writer.cnic ILIKE :q OR hh_head.full_name ILIKE :q OR hh_head.cnic ILIKE :q)",
        { q: `%${search}%` },
      );
    }
    const aidType = String(params.requested_aid_type || "").trim();
    if (aidType) {
      qb.andWhere("a.requested_aid_type = :aidType", { aidType });
    }
    const district = String(params.district || "").trim();
    if (district) {
      qb.andWhere("beneficiary.district ILIKE :district", {
        district: `%${district}%`,
      });
    }
    const assignee = Number(params.assigned_to_user_id);
    if (Number.isFinite(assignee) && assignee > 0) {
      qb.andWhere("a.assigned_to_user_id = :assignee", { assignee });
    }
  }

  private mapStatusToStage(status: string | null | undefined): string {
    switch (String(status || "").toLowerCase()) {
      case AidApplicationStatus.DRAFT:
        return "draft";
      case AidApplicationStatus.SUBMITTED:
        return "submitted";
      case AidApplicationStatus.UNDER_REVIEW:
        return "investigation";
      case AidApplicationStatus.CEO_APPROVAL_REQUIRED:
        return "pending_approval";
      case AidApplicationStatus.SUCCESSFUL:
      case AidApplicationStatus.DELIVERED:
        return "approved";
      case AidApplicationStatus.REJECTED:
        return "returned";
      default:
        return "submitted";
    }
  }

  private async buildStageCounts(params: {
    search?: string;
    requested_aid_type?: string;
    district?: string;
    assigned_to_user_id?: number | string;
  }) {
    const base = () => {
      const qb = this.appRepo
        .createQueryBuilder("a")
        .leftJoin("a.beneficiary", "beneficiary")
        .leftJoin("a.writer", "writer")
        .leftJoin("a.household", "household")
        .leftJoin("household.head_person", "hh_head")
        .where("a.is_archived = :archived", { archived: false });
      this.applyListFilters(qb, params);
      return qb;
    };

    const countFor = async (stage: string) => {
      const qb = base();
      this.applyStageFilter(qb, stage);
      return qb.getCount();
    };

    const [
      draft,
      submitted,
      investigation,
      pending_approval,
      approved,
      returned,
    ] = await Promise.all([
      countFor("draft"),
      countFor("submitted"),
      countFor("investigation"),
      countFor("pending_approval"),
      countFor("approved"),
      countFor("returned"),
    ]);

    return {
      draft,
      submitted,
      investigation,
      pending_approval,
      approved,
      returned,
    };
  }

  /**
   * Family Head ≠ Beneficiary. Prefer household head, then kinship edge
   * marked "Family head", then applicant/writer (when not self), else beneficiary.
   */
  private pickListFamilyHead(
    app: AidApplication,
    kinshipHeadByBeneficiary?: Map<number, AidPerson>,
  ): AidPerson | null {
    const b = (app as any).beneficiary as AidPerson | null;
    const hhHead = (app as any).household?.head_person as AidPerson | null;
    if (hhHead?.full_name) return hhHead;

    const bid = app.beneficiary_person_id;
    if (bid && kinshipHeadByBeneficiary?.has(bid)) {
      return kinshipHeadByBeneficiary.get(bid) || null;
    }

    const writer = (app as any).writer as AidPerson | null;
    const rel = String(app.writer_relation || "").toLowerCase();
    if (
      writer?.full_name &&
      rel &&
      rel !== "self" &&
      writer.id !== bid
    ) {
      return writer;
    }
    return b || null;
  }

  private async loadKinshipFamilyHeads(
    beneficiaryIds: number[],
  ): Promise<Map<number, AidPerson>> {
    const map = new Map<number, AidPerson>();
    const ids = [...new Set(beneficiaryIds.filter((id) => id > 0))];
    if (!ids.length) return map;

    const edges = await this.personRepo.manager
      .getRepository(AidKinshipEdge)
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.to_person", "to_person")
      .leftJoinAndSelect("e.from_person", "from_person")
      .where("e.is_archived = :arch", { arch: false })
      .andWhere(
        "(e.from_person_id IN (:...ids) OR e.to_person_id IN (:...ids))",
        { ids },
      )
      .andWhere("e.notes ILIKE :q", { q: "%family head%" })
      .getMany();

    for (const edge of edges) {
      for (const bid of ids) {
        if (edge.from_person_id !== bid && edge.to_person_id !== bid) continue;
        const other =
          edge.from_person_id === bid ? edge.to_person : edge.from_person;
        if (other?.full_name) map.set(bid, other);
      }
    }
    return map;
  }

  private summarizeListRow(
    app: AidApplication,
    members: number,
    kinshipHeadByBeneficiary?: Map<number, AidPerson>,
  ): Record<string, unknown> {
    const b = (app as any).beneficiary;
    const head = this.pickListFamilyHead(app, kinshipHeadByBeneficiary);
    const assigned = (app as any).assigned_to;
    const location = [b?.tehsil || b?.city, b?.district]
      .filter(Boolean)
      .join(", ");
    const vul = computeVulnerabilityScore({
      monthly_household_income: Number(b?.monthly_income) || null,
      household_members: members > 0 ? members : 1,
      earners: Number(b?.monthly_income) > 0 || b?.occupation ? 1 : 0,
      vulnerability_categories: b?.vulnerability ? [b.vulnerability] : [],
      resident_type: b?.resident_type || null,
      has_land: !!b?.has_land,
      property_type: b?.property_type || null,
      house_area_marla: Number(b?.house_area_marla) || null,
      has_livestock: !!b?.has_livestock,
      livestock_entries: b?.livestock_entries || null,
      has_vehicle: !!b?.has_vehicle,
      vehicle_type: b?.vehicle_type || null,
      disability_count: b?.has_disability ? 1 : 0,
      bisp_status: b?.bisp_status || null,
      requested_aid_type: app.requested_aid_type,
    });
    const assignedName = assigned
      ? [assigned.first_name, assigned.last_name].filter(Boolean).join(" ").trim() ||
        assigned.email ||
        null
      : null;

    return {
      ...app,
      created_by: this.pickAuditActor((app as any).created_by),
      stage: this.mapStatusToStage(app.status),
      members_count: members > 0 ? members : 1,
      location: location || null,
      vulnerability_pct: vul.total,
      assigned_to_label: assignedName,
      family_head_name: head?.full_name || b?.full_name || null,
      family_head_cnic: head?.cnic || b?.cnic || null,
    };
  }

  async findAll(params: {
    search?: string;
    status?: string;
    /** Pipeline stage for data-entry board cards */
    stage?: string;
    requested_aid_type?: string;
    district?: string;
    assigned_to_user_id?: number | string;
    /**
     * approvals = verified & not rejected (CEO queue + decided non-rejects)
     * entry = Beneficiary Registration board (excludes drafts)
     * drafts = Drafts board (status = draft only)
     */
    queue?: string;
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const qb = this.appRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.beneficiary", "beneficiary")
      .leftJoinAndSelect("a.writer", "writer")
      .leftJoinAndSelect("a.household", "household")
      .leftJoinAndSelect("household.head_person", "hh_head")
      .leftJoinAndSelect("a.assigned_to", "assigned_to")
      .leftJoinAndSelect("a.created_by", "created_by")
      .where("a.is_archived = :archived", { archived: false });

    const sortField = String(params.sortField || "created_at");
    const sortOrder =
      String(params.sortOrder || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
    const allowedSort = new Set([
      "created_at",
      "updated_at",
      "status",
      "application_no",
      "id",
      "verified_at",
    ]);
    const orderCol = allowedSort.has(sortField) ? sortField : "created_at";
    qb.orderBy(`a.${orderCol}`, sortOrder as "ASC" | "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    this.applyListFilters(qb, params);

    const isEntryBoard = params.queue === "entry";
    const isDraftsBoard = params.queue === "drafts";

    if (params.queue === "approvals") {
      qb.andWhere("a.verified_at IS NOT NULL");
      qb.andWhere("a.status != :rejected", {
        rejected: AidApplicationStatus.REJECTED,
      });
      qb.andWhere("a.status != :draft", {
        draft: AidApplicationStatus.DRAFT,
      });
      if (params.status) {
        qb.andWhere("a.status = :status", { status: params.status });
      }
    } else if (isDraftsBoard) {
      qb.andWhere("a.status = :draft", {
        draft: AidApplicationStatus.DRAFT,
      });
    } else if (isEntryBoard) {
      // Registration board: live applications only (not drafts)
      qb.andWhere("a.status != :draft", {
        draft: AidApplicationStatus.DRAFT,
      });
      if (params.stage) {
        this.applyStageFilter(qb, params.stage);
      } else if (params.status) {
        qb.andWhere("a.status = :status", { status: params.status });
      }
    } else if (params.stage) {
      this.applyStageFilter(qb, params.stage);
    } else if (params.status) {
      qb.andWhere("a.status = :status", { status: params.status });
    } else {
      // Verification Process default: hide registration drafts
      qb.andWhere("a.status != :draft", {
        draft: AidApplicationStatus.DRAFT,
      });
    }

    const [rows, total] = await qb.getManyAndCount();

    const householdIds = [
      ...new Set(
        rows
          .map((r) => r.household_id)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
    /** person_ids per household — beneficiary + family head always count */
    const memberIdsByHousehold = new Map<number, Set<number>>();
    if (householdIds.length) {
      const raw = await this.memberRepo
        .createQueryBuilder("m")
        .select("m.household_id", "household_id")
        .addSelect("m.person_id", "person_id")
        .where("m.household_id IN (:...ids)", { ids: householdIds })
        .andWhere("m.is_archived = :arch", { arch: false })
        .getRawMany();
      for (const row of raw) {
        const hid = Number(row.household_id);
        const pid = Number(row.person_id);
        if (!hid || !pid) continue;
        if (!memberIdsByHousehold.has(hid)) {
          memberIdsByHousehold.set(hid, new Set());
        }
        memberIdsByHousehold.get(hid)!.add(pid);
      }
    }

    const kinshipHeads = await this.loadKinshipFamilyHeads(
      rows.map((r) => r.beneficiary_person_id).filter(Boolean),
    );

    const data = rows.map((app) => {
      const ids = new Set<number>(
        app.household_id
          ? [...(memberIdsByHousehold.get(app.household_id) || [])]
          : [],
      );
      if (app.beneficiary_person_id) ids.add(app.beneficiary_person_id);
      const head = this.pickListFamilyHead(app, kinshipHeads);
      if (head?.id) ids.add(head.id);
      const members = Math.max(ids.size, 1);
      return this.summarizeListRow(app, members, kinshipHeads);
    });

    const stage_counts = await this.buildStageCounts(params);

    const districtRows = await this.appRepo
      .createQueryBuilder("a")
      .innerJoin("a.beneficiary", "beneficiary")
      .select("DISTINCT beneficiary.district", "district")
      .where("a.is_archived = :archived", { archived: false })
      .andWhere("beneficiary.district IS NOT NULL")
      .andWhere("TRIM(beneficiary.district) != ''")
      .orderBy("beneficiary.district", "ASC")
      .getRawMany();
    const districts = districtRows
      .map((r) => String(r.district || "").trim())
      .filter(Boolean);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      stage_counts,
      filter_options: { districts },
    };
  }

  async findOne(id: number) {
    const app = await this.appRepo.findOne({
      where: { id, is_archived: false },
      relations: [
        "beneficiary",
        "writer",
        "household",
        "assigned_to",
        "verified_by",
        "ceo_decided_by",
        "delivered_by",
        "leakage_override_by",
        "created_by",
      ],
    });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    const attachments = await this.attachmentRepo.find({
      where: { application_id: id, is_archived: false },
      relations: ["uploaded_by"],
      order: { created_at: "DESC" },
    });
    const duplicate_flags = await this.buildDuplicateFlags(app);
    const aid_history = await this.buildAidHistory(app);

    let personDetail: Awaited<
      ReturnType<AidPeopleService["findOneDetailed"]>
    > | null = null;
    try {
      personDetail = await this.peopleService.findOneDetailed(
        app.beneficiary_person_id,
      );
    } catch {
      personDetail = null;
    }

    const investigation_items = buildInvestigationItems({
      beneficiary: personDetail?.person || app.beneficiary,
      writer: app.writer,
      writer_relation: app.writer_relation,
      family_tree: personDetail?.family_tree || null,
      family_counts: personDetail?.family_counts || null,
      households: personDetail?.households || null,
      request_summary: app.request_summary,
      requested_aid_type: app.requested_aid_type,
    });

    const vulnerability = this.buildVulnerabilityBundle(
      app,
      personDetail,
      (app.verification_checklist as Record<string, unknown>) || null,
      (app.investigation_recommendation as Record<string, unknown>) || null,
    );

    return {
      ...app,
      created_by: this.pickAuditActor((app as any).created_by),
      attachments,
      duplicate_flags,
      aid_history,
      investigation_items,
      vulnerability,
      /** @deprecated use investigation_items */
      verification_checklist_items: investigation_items,
    };
  }

  private buildVulnerabilityInputs(
    app: AidApplication,
    personDetail: Awaited<ReturnType<AidPeopleService["findOneDetailed"]>> | null,
  ): VulnerabilityInputs {
    const beneficiary = personDetail?.person || (app as any).beneficiary;
    const writer = (app as any).writer;
    const households = personDetail?.households || [];
    const familyTree = personDetail?.family_tree || {};
    const familyCounts = (personDetail?.family_counts || {}) as Record<
      string,
      number
    >;

    let head =
      households
        .flatMap((h: any) => h.members || [])
        .find(
          (m: any) =>
            String(m.role_in_household || "").toLowerCase() === "head" &&
            m.person,
        )?.person || null;
    if (!head) {
      head = households.find((h: any) => h.head_person)?.head_person || null;
    }
    if (!head) {
      head = (familyTree as any)?.parents?.[0]?.person || null;
    }
    if (
      !head &&
      writer &&
      String(app.writer_relation || "").toLowerCase() !== "self"
    ) {
      head = writer;
    }
    const scorePerson = head || beneficiary;

    let members = 0;
    const memberIds = new Set<number>();
    for (const hh of households as any[]) {
      for (const m of hh.members || []) {
        if (m.person?.id) memberIds.add(m.person.id);
      }
      const hhHeadId = hh.head_person?.id || hh.head_person_id;
      if (hhHeadId) memberIds.add(Number(hhHeadId));
    }
    // Beneficiary and family head always count as family members
    if (beneficiary?.id) memberIds.add(beneficiary.id);
    if (head?.id) memberIds.add(head.id);
    if (memberIds.size) members = memberIds.size;
    else {
      members =
        Number(familyCounts.total_members) ||
        Number(familyCounts.total_linked || 0) + (beneficiary ? 1 : 0);
    }
    if (members < 1) members = 1;

    let earners = 0;
    const peoplePool: any[] = [];
    if (scorePerson) peoplePool.push(scorePerson);
    if (beneficiary && beneficiary.id !== scorePerson?.id) {
      peoplePool.push(beneficiary);
    }
    for (const hh of households as any[]) {
      for (const m of hh.members || []) {
        if (m.person) peoplePool.push(m.person);
      }
    }
    const seen = new Set<number>();
    for (const p of peoplePool) {
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      const income = Number(p.monthly_income);
      if ((Number.isFinite(income) && income > 0) || p.occupation) {
        earners += 1;
      }
    }
    if (earners === 0 && Number(scorePerson?.monthly_income) > 0) earners = 1;

    let disability_count = 0;
    for (const p of peoplePool) {
      if (!p?.id || !p.has_disability) continue;
      disability_count += 1;
    }
    if (!disability_count && beneficiary?.has_disability) disability_count = 1;

    const cats = [
      scorePerson?.vulnerability,
      beneficiary?.vulnerability,
    ].filter(Boolean) as string[];

    return {
      monthly_household_income: Number(scorePerson?.monthly_income) || null,
      household_members: members,
      earners,
      vulnerability_categories: cats,
      resident_type: scorePerson?.resident_type || beneficiary?.resident_type,
      house_structure: null,
      has_land: !!(scorePerson?.has_land || beneficiary?.has_land),
      property_type:
        scorePerson?.property_type || beneficiary?.property_type || null,
      house_area_marla:
        Number(scorePerson?.house_area_marla ?? beneficiary?.house_area_marla) ||
        null,
      has_livestock: !!(
        scorePerson?.has_livestock || beneficiary?.has_livestock
      ),
      livestock_entries:
        (scorePerson?.livestock_entries as any) ||
        (beneficiary?.livestock_entries as any) ||
        null,
      has_vehicle: !!(scorePerson?.has_vehicle || beneficiary?.has_vehicle),
      vehicle_type:
        scorePerson?.vehicle_type || beneficiary?.vehicle_type || null,
      disability_count,
      bisp_status: beneficiary?.bisp_status || scorePerson?.bisp_status || null,
      requested_aid_type: app.requested_aid_type,
    };
  }

  private buildVulnerabilityBundle(
    app: AidApplication,
    personDetail: Awaited<ReturnType<AidPeopleService["findOneDetailed"]>> | null,
    checklist: Record<string, unknown> | null,
    recommendation: Record<string, unknown> | null,
  ) {
    const declaredInputs = this.buildVulnerabilityInputs(app, personDetail);
    const declared = computeVulnerabilityScore(declaredInputs);

    const afterInputs: VulnerabilityInputs = { ...declaredInputs };
    const incomeEntry = checklist
      ? normalizeInvestigationEntry(checklist.monthly_household_income)
      : null;
    if (incomeEntry?.status === "mismatch") {
      const fromNote = extractAmountFromNote(incomeEntry.note);
      const fromRec = Number(recommendation?.found_monthly_income);
      const bump =
        (Number.isFinite(fromRec) && fromRec > 0 ? fromRec : null) ?? fromNote;
      if (bump != null && afterInputs.monthly_household_income != null) {
        // If note looks like "extra" earnings, add; else treat as found total when larger
        const note = String(incomeEntry.note || "").toLowerCase();
        if (note.includes("more") || note.includes("extra") || note.includes("also")) {
          afterInputs.monthly_household_income += bump;
        } else {
          afterInputs.monthly_household_income = Math.max(
            afterInputs.monthly_household_income,
            bump,
          );
        }
      }
    }

    const vehicleEntry = checklist
      ? normalizeInvestigationEntry(checklist.vehicle)
      : null;
    if (
      vehicleEntry &&
      (vehicleEntry.status === "verified" || vehicleEntry.status === "mismatch")
    ) {
      const note = String(vehicleEntry.note || "").toLowerCase();
      if (
        note.includes("motorcycle") ||
        note.includes("bike") ||
        note.includes("rickshaw") ||
        afterInputs.has_vehicle
      ) {
        afterInputs.has_vehicle = true;
        if (!afterInputs.vehicle_type) {
          afterInputs.vehicle_type = note.includes("rickshaw")
            ? "rickshaw"
            : "motorcycle";
        }
      }
    }

    if (
      recommendation?.found_monthly_income != null &&
      Number(recommendation.found_monthly_income) > 0
    ) {
      afterInputs.monthly_household_income = Number(
        recommendation.found_monthly_income,
      );
    }

    const after_visit = computeVulnerabilityScore(afterInputs);
    const deltas = vulnerabilityDeltas(declared, after_visit);

    return {
      declared,
      after_visit,
      deltas,
    };
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, "");
    return digits.length >= 7 ? digits : null;
  }

  private normalizeAddress(address?: string | null): string | null {
    if (!address) return null;
    const cleaned = String(address).trim().toLowerCase().replace(/\s+/g, " ");
    return cleaned.length >= 8 ? cleaned : null;
  }

  private async buildDuplicateFlags(app: AidApplication) {
    const beneficiary =
      app.beneficiary ||
      (await this.peopleService.findOne(app.beneficiary_person_id));

    const phone = this.normalizePhone(beneficiary.phone);
    const address = this.normalizeAddress(beneficiary.address);
    const cnic = beneficiary.cnic ? String(beneficiary.cnic).replace(/\D/g, "") : null;

    const phone_matches: AidPerson[] = [];
    const address_matches: AidPerson[] = [];
    const cnic_matches: AidPerson[] = [];

    if (phone) {
      const rows = await this.personRepo
        .createQueryBuilder("p")
        .where("p.is_archived = false")
        .andWhere("p.id != :id", { id: beneficiary.id })
        .andWhere(
          "regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') = :phone",
          { phone },
        )
        .take(20)
        .getMany();
      phone_matches.push(...rows);
    }

    if (cnic) {
      const rows = await this.personRepo
        .createQueryBuilder("p")
        .where("p.is_archived = false")
        .andWhere("p.id != :id", { id: beneficiary.id })
        .andWhere(
          "REPLACE(REPLACE(COALESCE(p.cnic, ''), '-', ''), ' ', '') = :cnic",
          { cnic },
        )
        .take(20)
        .getMany();
      cnic_matches.push(...rows);
    }

    if (address) {
      const rows = await this.personRepo
        .createQueryBuilder("p")
        .where("p.is_archived = false")
        .andWhere("p.id != :id", { id: beneficiary.id })
        .andWhere("p.address IS NOT NULL")
        .andWhere(
          "LOWER(REGEXP_REPLACE(p.address, '\\s+', ' ', 'g')) LIKE :addr",
          { addr: `%${address.slice(0, 40)}%` },
        )
        .take(20)
        .getMany();
      address_matches.push(...rows);
    }

    const relatedPersonIds = new Set<number>([
      beneficiary.id,
      ...phone_matches.map((p) => p.id),
      ...address_matches.map((p) => p.id),
      ...cnic_matches.map((p) => p.id),
    ]);

    const prior_applications = await this.appRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.beneficiary", "beneficiary")
      .where("a.is_archived = false")
      .andWhere("a.id != :appId", { appId: app.id })
      .andWhere("a.beneficiary_person_id IN (:...pids)", {
        pids: [...relatedPersonIds],
      })
      .orderBy("a.created_at", "DESC")
      .take(30)
      .getMany();

    const has_flags =
      phone_matches.length > 0 ||
      address_matches.length > 0 ||
      cnic_matches.length > 0 ||
      prior_applications.length > 0;

    return {
      has_flags,
      phone_matches: phone_matches.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        cnic: p.cnic,
        phone: p.phone,
        address: p.address,
        city: p.city,
        match_on: "phone",
      })),
      cnic_matches: cnic_matches.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        cnic: p.cnic,
        phone: p.phone,
        address: p.address,
        city: p.city,
        match_on: "cnic",
      })),
      address_matches: address_matches.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        cnic: p.cnic,
        phone: p.phone,
        address: p.address,
        city: p.city,
        match_on: "address",
      })),
      prior_applications: prior_applications.map((a) => ({
        id: a.id,
        application_no: a.application_no,
        status: a.status,
        requested_aid_type: a.requested_aid_type,
        beneficiary_person_id: a.beneficiary_person_id,
        beneficiary_name: a.beneficiary?.full_name || null,
        submitted_at: a.submitted_at,
      })),
    };
  }

  private successReferenceDate(a: AidApplication): Date {
    if (a.delivered_at) return new Date(a.delivered_at);
    if (a.ceo_decided_at) return new Date(a.ceo_decided_at);
    if (a.verified_at) return new Date(a.verified_at);
    if (a.submitted_at) return new Date(a.submitted_at);
    return a.created_at ? new Date(a.created_at) : new Date();
  }

  private mapHistoryRow(a: AidApplication, scope: "person" | "household") {
    return {
      id: a.id,
      application_no: a.application_no,
      status: a.status,
      requested_aid_type: a.requested_aid_type,
      beneficiary_person_id: a.beneficiary_person_id,
      beneficiary_name: a.beneficiary?.full_name || null,
      household_id: a.household_id,
      reference_at: this.successReferenceDate(a).toISOString(),
      scope,
    };
  }

  private async resolveHouseholdPersonIds(
    beneficiaryId: number,
    householdId?: number | null,
  ): Promise<number[]> {
    const ids = new Set<number>([beneficiaryId]);
    const memberships = await this.memberRepo.find({
      where: { person_id: beneficiaryId, is_archived: false },
    });
    const householdIds = new Set<number>(
      memberships.map((m) => m.household_id).filter(Boolean),
    );
    if (householdId) householdIds.add(householdId);

    for (const hid of householdIds) {
      const mates = await this.memberRepo.find({
        where: { household_id: hid, is_archived: false },
      });
      for (const m of mates) ids.add(m.person_id);
    }
    return [...ids];
  }

  private async buildAidHistory(app: AidApplication) {
    const beneficiaryId = app.beneficiary_person_id;
    const householdPersonIds = await this.resolveHouseholdPersonIds(
      beneficiaryId,
      app.household_id,
    );

    const successApps = await this.appRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.beneficiary", "beneficiary")
      .where("a.is_archived = false")
      .andWhere("a.id != :appId", { appId: app.id })
      .andWhere("a.status IN (:...statuses)", { statuses: AID_SUCCESS_STATUSES })
      .andWhere("a.beneficiary_person_id IN (:...pids)", {
        pids: householdPersonIds,
      })
      .orderBy("a.created_at", "DESC")
      .take(50)
      .getMany();

    const person_successful = successApps
      .filter((a) => a.beneficiary_person_id === beneficiaryId)
      .map((a) => this.mapHistoryRow(a, "person"));

    const household_successful = successApps
      .filter((a) => a.beneficiary_person_id !== beneficiaryId)
      .map((a) => this.mapHistoryRow(a, "household"));

    const year = new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);

    const thisYearHits = successApps.filter(
      (a) => this.successReferenceDate(a) >= yearStart,
    );

    const already_received_this_year_person = thisYearHits.some(
      (a) => a.beneficiary_person_id === beneficiaryId,
    );
    const already_received_this_year_household = thisYearHits.length > 0;

    let lastSuccess: AidApplication | null = null;
    for (const a of successApps) {
      if (!lastSuccess) {
        lastSuccess = a;
        continue;
      }
      if (this.successReferenceDate(a) > this.successReferenceDate(lastSuccess)) {
        lastSuccess = a;
      }
    }

    let days_since_last_success: number | null = null;
    let cooldown_ends_at: string | null = null;
    let within_cooldown = false;
    if (lastSuccess) {
      const ref = this.successReferenceDate(lastSuccess);
      const ms = Date.now() - ref.getTime();
      days_since_last_success = Math.floor(ms / (24 * 60 * 60 * 1000));
      const ends = new Date(ref);
      ends.setDate(ends.getDate() + AID_COOLDOWN_DAYS);
      cooldown_ends_at = ends.toISOString();
      within_cooldown = days_since_last_success < AID_COOLDOWN_DAYS;
    }

    const already_received_this_year = already_received_this_year_household;
    const requires_override =
      already_received_this_year || within_cooldown;
    const override_recorded = !!(
      app.leakage_override_reason &&
      String(app.leakage_override_reason).trim().length >= 5
    );

    const reasons: string[] = [];
    if (already_received_this_year_person) {
      reasons.push("Beneficiary already received successful aid this calendar year");
    } else if (already_received_this_year_household) {
      reasons.push(
        "A household member already received successful aid this calendar year",
      );
    }
    if (within_cooldown && lastSuccess) {
      reasons.push(
        `Within ${AID_COOLDOWN_DAYS}-day cooldown since ${lastSuccess.application_no} (${days_since_last_success} days ago)`,
      );
    }

    return {
      cooldown_days: AID_COOLDOWN_DAYS,
      calendar_year: year,
      already_received_this_year,
      already_received_this_year_person,
      already_received_this_year_household,
      within_cooldown,
      days_since_last_success,
      cooldown_ends_at,
      requires_override,
      override_recorded,
      reasons,
      person_successful,
      household_successful,
      household_person_ids: householdPersonIds,
    };
  }

  private async assertLeakageOverrideAllowed(
    app: AidApplication,
    overrideReason?: string | null,
    user?: User,
  ) {
    const history = await this.buildAidHistory(app);
    if (!history.requires_override) {
      return history;
    }
    if (history.override_recorded) {
      return history;
    }
    const reason = String(overrideReason || "").trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        `Leakage override required: ${history.reasons.join("; ")}. Provide leakage_override_reason (min 5 chars).`,
      );
    }
    app.leakage_override_reason = reason;
    app.leakage_override_at = new Date();
    app.leakage_override_by_id = user?.id ?? null;
    return history;
  }

  private async buildInvestigationForApp(app: AidApplication) {
    let personDetail: Awaited<
      ReturnType<AidPeopleService["findOneDetailed"]>
    > | null = null;
    try {
      personDetail = await this.peopleService.findOneDetailed(
        app.beneficiary_person_id,
      );
    } catch {
      personDetail = null;
    }
    return buildInvestigationItems({
      beneficiary: personDetail?.person || (app as any).beneficiary,
      writer: (app as any).writer,
      writer_relation: app.writer_relation,
      family_tree: personDetail?.family_tree || null,
      family_counts: personDetail?.family_counts || null,
      households: personDetail?.households || null,
      request_summary: app.request_summary,
      requested_aid_type: app.requested_aid_type,
    });
  }

  async update(id: number, dto: UpdateAidApplicationDto, user?: User) {
    const app = await this.appRepo.findOne({ where: { id, is_archived: false } });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    if (
      app.status === AidApplicationStatus.REJECTED ||
      app.status === AidApplicationStatus.DELIVERED
    ) {
      throw new BadRequestException("Cannot edit a closed application");
    }

    if (
      dto.verification_checklist !== undefined ||
      dto.investigation_recommendation !== undefined
    ) {
      await this.assertCanPerformInvestigation(app, user);
    }

    if (dto.beneficiary && app.beneficiary_person_id) {
      await this.peopleService.update(
        app.beneficiary_person_id,
        dto.beneficiary as any,
        user,
      );
    }

    if (dto.writer_person_id !== undefined) {
      const wid = Number(dto.writer_person_id);
      if (!Number.isFinite(wid) || wid <= 0) {
        throw new BadRequestException("writer_person_id is invalid");
      }
      await this.peopleService.findOne(wid);
      app.writer_person_id = wid;
    }

    if (dto.writer) {
      const writerId = app.writer_person_id || app.beneficiary_person_id;
      if (writerId) {
        await this.peopleService.update(writerId, dto.writer as any, user);
      }
    }

    if (dto.household_id !== undefined) app.household_id = dto.household_id;
    if (dto.writer_relation !== undefined) app.writer_relation = dto.writer_relation;
    if (dto.title !== undefined) app.title = dto.title?.trim() || null;
    if (dto.request_summary !== undefined) {
      app.request_summary = dto.request_summary?.trim() || null;
    }
    if (dto.case_source !== undefined) {
      app.case_source = dto.case_source || null;
    }
    if (dto.requested_aid_type !== undefined) {
      app.requested_aid_type = dto.requested_aid_type;
      if (dto.requested_aid_type !== AidRequestType.EDUCATION) {
        app.education_details = null;
      }
      if (dto.requested_aid_type !== AidRequestType.RATION) {
        app.ration_details = null;
      }
      if (dto.requested_aid_type !== AidRequestType.MARRIAGE_GIFT) {
        app.marriage_gift_details = null;
      }
      if (dto.requested_aid_type !== AidRequestType.FINANCIAL_ASSISTANCE) {
        app.financial_assistance_details = null;
      }
      if (dto.requested_aid_type !== AidRequestType.CLEAN_WATER) {
        app.clean_water_details = null;
      }
    }
    if (dto.aid_program !== undefined) {
      app.aid_program = dto.aid_program?.trim() || null;
    }
    if (dto.expected_amount !== undefined) {
      app.expected_amount =
        dto.expected_amount != null &&
        Number.isFinite(Number(dto.expected_amount))
          ? String(dto.expected_amount)
          : null;
    }
    if (dto.expected_amount_max !== undefined) {
      app.expected_amount_max =
        dto.expected_amount_max != null &&
        Number.isFinite(Number(dto.expected_amount_max))
          ? String(dto.expected_amount_max)
          : null;
    }
    if (dto.education_details !== undefined) {
      app.education_details =
        (dto.requested_aid_type ?? app.requested_aid_type) ===
        AidRequestType.EDUCATION
          ? dto.education_details
          : null;
    }
    if (dto.ration_details !== undefined) {
      app.ration_details =
        (dto.requested_aid_type ?? app.requested_aid_type) ===
        AidRequestType.RATION
          ? dto.ration_details
          : null;
    }
    if (dto.marriage_gift_details !== undefined) {
      app.marriage_gift_details =
        (dto.requested_aid_type ?? app.requested_aid_type) ===
        AidRequestType.MARRIAGE_GIFT
          ? dto.marriage_gift_details
          : null;
    }
    if (dto.financial_assistance_details !== undefined) {
      app.financial_assistance_details =
        (dto.requested_aid_type ?? app.requested_aid_type) ===
        AidRequestType.FINANCIAL_ASSISTANCE
          ? dto.financial_assistance_details
          : null;
    }
    if (dto.clean_water_details !== undefined) {
      app.clean_water_details =
        (dto.requested_aid_type ?? app.requested_aid_type) ===
        AidRequestType.CLEAN_WATER
          ? dto.clean_water_details
          : null;
    }
    if (dto.zakat_permission !== undefined) {
      app.zakat_permission = dto.zakat_permission;
    }
    if (dto.consent_form !== undefined) {
      app.consent_form = dto.consent_form;
    }
    if (
      dto.assigned_to_user_id !== undefined &&
      app.status !== AidApplicationStatus.DRAFT
    ) {
      // Draft assignment is only set via approve-draft
      app.assigned_to_user_id = dto.assigned_to_user_id;
    }
    if (dto.verification_notes !== undefined) {
      app.verification_notes = dto.verification_notes?.trim() || null;
    }
    if (dto.verification_checklist !== undefined) {
      app.verification_checklist =
        dto.verification_checklist &&
        typeof dto.verification_checklist === "object"
          ? dto.verification_checklist
          : null;
    }
    if (dto.investigation_recommendation !== undefined) {
      app.investigation_recommendation =
        dto.investigation_recommendation &&
        typeof dto.investigation_recommendation === "object"
          ? dto.investigation_recommendation
          : null;
    }
    if (app.status === AidApplicationStatus.SUBMITTED) {
      app.status = AidApplicationStatus.UNDER_REVIEW;
    }
    app.updated_by = user || null;
    await this.appRepo.save(app);

    const beneficiaryId = app.beneficiary_person_id;
    for (const fm of dto.family_members || []) {
      if (!fm?.relation_type || !beneficiaryId) continue;
      const hasPerson =
        fm.existing_person_id ||
        (fm.person && String(fm.person.full_name || "").trim());
      if (!hasPerson) continue;
      try {
        if (fm.existing_person_id && fm.person) {
          await this.peopleService.update(
            Number(fm.existing_person_id),
            fm.person as any,
            user,
          );
        }
        await this.peopleService.addFamilyMember(beneficiaryId, fm, user);
      } catch (err) {
        if (err instanceof ConflictException) continue;
        throw err;
      }
    }

    return this.findOne(id);
  }

  /**
   * Registration approval: draft → submitted (enters Verification Process).
   * Requires assigning a program-department user as case owner.
   */
  async approveDraft(
    id: number,
    dto: ApproveDraftAidApplicationDto,
    user?: User,
  ) {
    const app = await this.appRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    if (app.status !== AidApplicationStatus.DRAFT) {
      throw new BadRequestException(
        "Only draft applications can be approved for verification",
      );
    }

    const assigneeId = Number(dto?.assigned_to_user_id);
    if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
      throw new BadRequestException(
        "assigned_to_user_id is required (program department user)",
      );
    }
    const assignee = await this.usersService.findOne(assigneeId);
    if (String(assignee.department || "").toLowerCase() !== Department.PROGRAM) {
      throw new BadRequestException(
        "Assignee must be a user in the program department",
      );
    }

    app.assigned_to_user_id = assigneeId;
    app.status = AidApplicationStatus.SUBMITTED;
    app.submitted_at = new Date();
    app.updated_by = user || null;
    await this.appRepo.save(app);
    return this.findOne(id);
  }

  async reject(id: number, dto: RejectAidApplicationDto, user?: User) {
    const app = await this.appRepo.findOne({ where: { id, is_archived: false } });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    if (app.status === AidApplicationStatus.DRAFT) {
      throw new BadRequestException(
        "Approve or edit the draft instead of rejecting it from verification",
      );
    }
    if (app.status === AidApplicationStatus.SUCCESSFUL || app.status === AidApplicationStatus.DELIVERED) {
      throw new BadRequestException("Cannot reject after success");
    }
    const reason = String(dto.rejection_reason || "").trim();
    if (reason.length < 2) {
      throw new BadRequestException("rejection_reason is required");
    }
    app.status = AidApplicationStatus.REJECTED;
    app.rejection_reason = reason;
    app.updated_by = user || null;
    await this.appRepo.save(app);
    return this.findOne(id);
  }

  async markVerified(id: number, dto: VerifyAidApplicationDto, user?: User) {
    const app = await this.appRepo.findOne({
      where: { id, is_archived: false },
      relations: ["beneficiary", "writer"],
    });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    if (
      ![
        AidApplicationStatus.SUBMITTED,
        AidApplicationStatus.UNDER_REVIEW,
      ].includes(app.status)
    ) {
      throw new BadRequestException(
        "Only submitted/under_review applications can be verified",
      );
    }
    await this.assertCanPerformInvestigation(app, user);
    const investigationItems = await this.buildInvestigationForApp(app);
    let checklistPayload: Record<string, unknown>;
    try {
      checklistPayload = assertInvestigationComplete(
        investigationItems,
        dto.verification_checklist as Record<string, unknown>,
      );
    } catch (err: any) {
      throw new BadRequestException(
        err?.message || "Complete investigation before verify",
      );
    }

    const rec = dto.recommendation;
    if (!rec?.decision) {
      throw new BadRequestException(
        "Investigation recommendation is required (approve as requested / with changes / reject)",
      );
    }
    const remarks = String(rec.remarks || "").trim();
    if (remarks.length < 3) {
      throw new BadRequestException(
        "Investigator remarks are required (min 3 characters)",
      );
    }
    if (rec.decision !== "reject") {
      const amount = Number(rec.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          "Recommended amount (PKR) is required for approval recommendations",
        );
      }
      if (rec.decision === "approve_with_changes") {
        const months = Number(rec.period_months);
        if (!Number.isFinite(months) || months <= 0) {
          throw new BadRequestException(
            "Period (months) is required when approving with changes",
          );
        }
      }
    }

    await this.assertLeakageOverrideAllowed(app, dto.leakage_override_reason, user);

    let personDetail: Awaited<
      ReturnType<AidPeopleService["findOneDetailed"]>
    > | null = null;
    try {
      personDetail = await this.peopleService.findOneDetailed(
        app.beneficiary_person_id,
      );
    } catch {
      personDetail = null;
    }
    const vulnerability = this.buildVulnerabilityBundle(
      app,
      personDetail,
      checklistPayload,
      rec as unknown as Record<string, unknown>,
    );

    app.status = AidApplicationStatus.CEO_APPROVAL_REQUIRED;
    app.ceo_approval_status = AidCeoApprovalStatus.PENDING;
    app.verification_notes =
      dto.verification_notes?.trim() || remarks || app.verification_notes;
    app.verification_checklist = checklistPayload;
    app.investigation_recommendation = {
      decision: rec.decision,
      amount: rec.amount ?? null,
      period_months: rec.period_months ?? null,
      remarks,
      found_monthly_income: rec.found_monthly_income ?? null,
      vulnerability_score_declared: vulnerability.declared.total,
      vulnerability_score_after_visit: vulnerability.after_visit.total,
      vulnerability_deltas: vulnerability.deltas,
      vulnerability_declared: vulnerability.declared,
      vulnerability_after_visit: vulnerability.after_visit,
      submitted_at: new Date().toISOString(),
    };
    app.verified_at = new Date();
    app.verified_by_id = user?.id ?? null;
    app.updated_by = user || null;
    await this.appRepo.save(app);
    return this.findOne(id);
  }

  async ceoDecide(id: number, dto: CeoDecideAidApplicationDto, user?: User) {
    const app = await this.appRepo.findOne({ where: { id, is_archived: false } });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    if (app.status !== AidApplicationStatus.CEO_APPROVAL_REQUIRED) {
      throw new BadRequestException("Application is not awaiting CEO approval");
    }
    if (
      dto.decision !== AidCeoApprovalStatus.APPROVED &&
      dto.decision !== AidCeoApprovalStatus.REJECTED
    ) {
      throw new BadRequestException("decision must be approved or rejected");
    }

    if (dto.decision === AidCeoApprovalStatus.APPROVED) {
      await this.assertLeakageOverrideAllowed(app, dto.leakage_override_reason, user);
    }

    app.ceo_decided_at = new Date();
    app.ceo_decided_by_id = user?.id ?? null;
    app.updated_by = user || null;

    if (dto.decision === AidCeoApprovalStatus.APPROVED) {
      app.ceo_approval_status = AidCeoApprovalStatus.APPROVED;
      app.status = AidApplicationStatus.SUCCESSFUL;
      app.delivery_status = AidDeliveryStatus.PENDING;
    } else {
      const reason = String(dto.ceo_rejection_reason || "").trim();
      if (reason.length < 2) {
        throw new BadRequestException("ceo_rejection_reason is required");
      }
      app.ceo_approval_status = AidCeoApprovalStatus.REJECTED;
      app.ceo_rejection_reason = reason;
      app.status = AidApplicationStatus.REJECTED;
      app.rejection_reason = reason;
    }
    await this.appRepo.save(app);
    return this.findOne(id);
  }

  async markDelivery(id: number, dto: DeliverAidApplicationDto, user?: User) {
    const app = await this.appRepo.findOne({ where: { id, is_archived: false } });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    if (
      app.status !== AidApplicationStatus.SUCCESSFUL &&
      app.status !== AidApplicationStatus.DELIVERED
    ) {
      throw new BadRequestException(
        "Delivery can only be updated after CEO approval (successful)",
      );
    }
    app.delivery_status = dto.delivery_status;
    app.delivery_notes = dto.delivery_notes?.trim() || app.delivery_notes;
    app.updated_by = user || null;
    if (
      dto.delivery_status === AidDeliveryStatus.DELIVERED ||
      dto.delivery_status === AidDeliveryStatus.PARTIAL
    ) {
      app.delivered_at = new Date();
      app.delivered_by_id = user?.id ?? null;
    }
    if (dto.delivery_status === AidDeliveryStatus.DELIVERED) {
      app.status = AidApplicationStatus.DELIVERED;
    }
    await this.appRepo.save(app);
    return this.findOne(id);
  }

  async softDelete(id: number, user?: User) {
    const app = await this.appRepo.findOne({ where: { id, is_archived: false } });
    if (!app) throw new NotFoundException(`Application #${id} not found`);
    app.is_archived = true;
    app.updated_by = user || null;
    return this.appRepo.save(app);
  }

  async addAttachment(params: {
    applicationId?: number | null;
    personId?: number | null;
    context: AidAttachmentContext;
    file: Express.Multer.File;
    description?: string | null;
    user?: User;
  }) {
    if (!params.applicationId && !params.personId) {
      throw new BadRequestException("application_id or person_id is required");
    }
    if (params.applicationId) {
      const exists = await this.appRepo.findOne({
        where: { id: params.applicationId, is_archived: false },
      });
      if (!exists) {
        throw new NotFoundException(
          `Application #${params.applicationId} not found`,
        );
      }
      const desc = String(params.description || "").trim();
      const investigationAttach =
        params.context === AidAttachmentContext.SITE_VISIT ||
        [
          "site_visit",
          "need_verified",
          "duplicates_reviewed",
          "eligible_recommended",
          "home_visited",
        ].includes(desc);
      if (
        investigationAttach &&
        [
          AidApplicationStatus.SUBMITTED,
          AidApplicationStatus.UNDER_REVIEW,
        ].includes(exists.status)
      ) {
        await this.assertCanPerformInvestigation(exists, params.user);
      }
    }
    if (params.personId) {
      await this.peopleService.findOne(params.personId);
    }

    const uploaded = await this.s3.uploadAidAttachment(
      params.file,
      params.context,
    );
    const row = this.attachmentRepo.create({
      application_id: params.applicationId ?? null,
      person_id: params.personId ?? null,
      context: params.context,
      file_name: params.file.originalname,
      file_url: uploaded.url,
      file_type: params.file.mimetype || null,
      description: params.description?.trim() || null,
      uploaded_by: params.user || null,
      created_by: params.user || null,
      updated_by: params.user || null,
    });
    return this.attachmentRepo.save(row);
  }

  /** Upload a document to S3 and return URL (no person/app link yet — e.g. NECTA on create). */
  async uploadLooseDocument(file: Express.Multer.File, context = "necta") {
    if (!file) throw new BadRequestException("file is required");
    const uploaded = await this.s3.uploadAidAttachment(file, context);
    return {
      url: uploaded.url,
      file_name: file.originalname,
      file_type: file.mimetype || null,
    };
  }

  async deleteAttachment(attachmentId: number, user?: User) {
    const row = await this.attachmentRepo.findOne({
      where: { id: attachmentId, is_archived: false },
    });
    if (!row) throw new NotFoundException(`Attachment #${attachmentId} not found`);
    row.is_archived = true;
    row.updated_by = user || null;
    return this.attachmentRepo.save(row);
  }

  async listPersonAttachments(personId: number) {
    await this.peopleService.findOne(personId);
    return this.attachmentRepo.find({
      where: { person_id: personId, is_archived: false },
      relations: ["uploaded_by"],
      order: { created_at: "DESC" },
    });
  }

  async listForLookup(params?: EntityLookupParams): Promise<LookupOption[]> {
    return listEntityLookup(
      this.appRepo,
      {
        profile: LOOKUP_PROFILES.aid_applications,
        searchFields: ["application_no", "title"],
        labelFallback: (row) => `#${row.id}`,
      },
      params,
    );
  }
}
