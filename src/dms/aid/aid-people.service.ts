import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../../users/user.entity";
import { AidKinshipRelation, AidPersonGender } from "./aid.enums";
import {
  CreateAidFamilyMemberDto,
  CreateAidKinshipDto,
  CreateAidPersonDto,
  UpdateAidPersonDto,
} from "./dto/aid.dto";
import { AidApplication } from "./entities/aid-application.entity";
import { AidHouseholdMember } from "./entities/aid-household-member.entity";
import { AidKinshipEdge } from "./entities/aid-kinship-edge.entity";
import { AidPerson } from "./entities/aid-person.entity";
import {
  LOOKUP_PROFILES,
  listEntityLookup,
  type EntityLookupParams,
  type LookupOption,
} from "../../utils/lookup";

type FamilyMemberRow = {
  edge_id: number;
  relation_type: AidKinshipRelation;
  notes: string | null;
  person: AidPerson;
};

@Injectable()
export class AidPeopleService {
  constructor(
    @InjectRepository(AidPerson)
    private readonly personRepo: Repository<AidPerson>,
    @InjectRepository(AidKinshipEdge)
    private readonly kinshipRepo: Repository<AidKinshipEdge>,
    @InjectRepository(AidHouseholdMember)
    private readonly memberRepo: Repository<AidHouseholdMember>,
    @InjectRepository(AidApplication)
    private readonly applicationRepo: Repository<AidApplication>,
  ) {}

  private pickAuditActor(user: any) {
    if (!user || typeof user !== "object") return null;
    return {
      id: user.id,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      email: user.email || null,
    };
  }

  normalizeCnic(cnic?: string | null): string | null {
    if (cnic == null) return null;
    const digits = String(cnic).replace(/\D/g, "");
    if (!digits) return null;
    return digits;
  }

  /** Match CNIC by digits only; optionally restrict to active or archived rows. */
  private async findByCnicDigits(
    cnicDigits: string | null,
    opts?: { excludeId?: number; archivedOnly?: boolean; activeOnly?: boolean },
  ): Promise<AidPerson | null> {
    if (!cnicDigits) return null;
    const qb = this.personRepo
      .createQueryBuilder("p")
      .where(
        "REPLACE(REPLACE(COALESCE(p.cnic, ''), '-', ''), ' ', '') = :cnic",
        { cnic: cnicDigits },
      );
    if (opts?.archivedOnly) {
      qb.andWhere("p.is_archived = :archived", { archived: true });
    } else if (opts?.activeOnly !== false) {
      // Default: only non-archived people count as conflicts / links
      qb.andWhere("p.is_archived = :archived", { archived: false });
    }
    if (opts?.excludeId) {
      qb.andWhere("p.id != :excludeId", { excludeId: opts.excludeId });
    }
    qb.orderBy("p.id", "ASC").take(1);
    return qb.getOne();
  }

  private async assertUniqueCnic(cnic: string | null, excludeId?: number) {
    if (!cnic) return;
    const existing = await this.findByCnicDigits(cnic, {
      excludeId,
      activeOnly: true,
    });
    if (existing) {
      throw new ConflictException(
        `CNIC already registered to person #${existing.id} (${existing.full_name})`,
      );
    }
  }

  /** Reactivate an archived person and apply create/update payload (CNIC reclaim). */
  private async reactivateArchivedPerson(
    person: AidPerson,
    dto: CreateAidPersonDto,
    user?: User,
  ) {
    person.is_archived = false;
    person.is_active = true;
    person.full_name = dto.full_name.trim();
    const mapped = this.mapPersonFields(dto);
    const cnic = this.normalizeCnic(dto.cnic);
    if (cnic) person.cnic = cnic;
    if (mapped.father_or_husband_name !== undefined) {
      person.father_or_husband_name = mapped.father_or_husband_name;
    }
    if (mapped.cnic_expiry !== undefined) person.cnic_expiry = mapped.cnic_expiry;
    if (mapped.name_urdu !== undefined) person.name_urdu = mapped.name_urdu;
    if (mapped.caste !== undefined) person.caste = mapped.caste;
    if (mapped.phone !== undefined) person.phone = mapped.phone;
    if (mapped.phone_alternate !== undefined) {
      person.phone_alternate = mapped.phone_alternate;
    }
    if (mapped.photo_url !== undefined) person.photo_url = mapped.photo_url;
    if (mapped.photo_name !== undefined) person.photo_name = mapped.photo_name;
    if (mapped.gender !== undefined) person.gender = mapped.gender;
    if (mapped.date_of_birth !== undefined) {
      person.date_of_birth = mapped.date_of_birth;
    }
    if (mapped.marital_status !== undefined) {
      person.marital_status = mapped.marital_status;
    }
    if (mapped.vulnerability !== undefined) {
      person.vulnerability = mapped.vulnerability;
    }
    if (mapped.occupation !== undefined) person.occupation = mapped.occupation;
    if (mapped.household_dependency !== undefined) {
      person.household_dependency = mapped.household_dependency;
    }
    if (mapped.education_level !== undefined) {
      person.education_level = mapped.education_level;
    }
    if (mapped.literacy_status !== undefined) {
      person.literacy_status = mapped.literacy_status;
    }
    if (mapped.literacy_category !== undefined) {
      person.literacy_category = mapped.literacy_category;
    }
    if (mapped.student_class !== undefined) {
      person.student_class = mapped.student_class;
    }
    if (mapped.student_class_type !== undefined) {
      person.student_class_type = mapped.student_class_type;
    }
    if (mapped.student_class_name !== undefined) {
      person.student_class_name = mapped.student_class_name;
    }
    if (mapped.monthly_income !== undefined) {
      person.monthly_income = mapped.monthly_income;
    }
    if (mapped.has_disability !== undefined) {
      person.has_disability = mapped.has_disability === true;
    }
    if (mapped.disability_type !== undefined) {
      person.disability_type = mapped.disability_type;
    }
    if (mapped.disability_certificate_url !== undefined) {
      person.disability_certificate_url = mapped.disability_certificate_url;
    }
    if (mapped.disability_certificate_name !== undefined) {
      person.disability_certificate_name = mapped.disability_certificate_name;
    }
    if (mapped.address !== undefined) person.address = mapped.address;
    if (mapped.current_address !== undefined) {
      person.current_address = mapped.current_address;
    }
    if (mapped.city !== undefined) person.city = mapped.city;
    if (mapped.province !== undefined) person.province = mapped.province;
    if (mapped.district !== undefined) person.district = mapped.district;
    if (mapped.tehsil !== undefined) person.tehsil = mapped.tehsil;
    if (mapped.union_council !== undefined) {
      person.union_council = mapped.union_council;
    }
    if (mapped.landmark !== undefined) person.landmark = mapped.landmark;
    if (mapped.is_alive !== undefined) person.is_alive = mapped.is_alive !== false;
    person.updated_by = user || null;
    return this.personRepo.save(person);
  }

  private sanitizeLivestockEntries(
    raw: Record<string, unknown>[] | null | undefined,
  ): Record<string, unknown>[] | null {
    if (!Array.isArray(raw)) return null;
    const allowedAnimals = new Set(["goat", "cow", "buffalo"]);
    const allowedOwnership = new Set(["personal", "sharing"]);
    const rows = raw
      .map((row) => {
        const animal = String(row?.animal_type || "").toLowerCase();
        const ownership = String(row?.ownership || "personal").toLowerCase();
        const qty = Number(row?.quantity);
        if (!allowedAnimals.has(animal) || !Number.isFinite(qty) || qty <= 0) {
          return null;
        }
        const entry: Record<string, unknown> = {
          animal_type: animal,
          quantity: Math.floor(qty),
          ownership: allowedOwnership.has(ownership) ? ownership : "personal",
        };
        if (entry.ownership === "sharing") {
          const ownerName = String(row?.owner_name || "").trim();
          const ownerContact = String(row?.owner_contact || "").trim();
          if (ownerName) entry.owner_name = ownerName;
          if (ownerContact) entry.owner_contact = ownerContact;
        }
        return entry;
      })
      .filter(Boolean) as Record<string, unknown>[];
    return rows.length ? rows : null;
  }

  private sanitizePropertyEntries(
    raw: Record<string, unknown>[] | null | undefined,
  ): Record<string, unknown>[] | null {
    if (!Array.isArray(raw)) return null;
    const allowedTypes = new Set([
      "agri",
      "commercial",
      "residential_ownership",
      "plot",
      "others",
    ]);
    const rows = raw
      .map((row) => {
        const property_type = String(row?.property_type || "")
          .trim()
          .toLowerCase();
        const property_area = String(row?.property_area || "").trim();
        const property_details = String(row?.property_details || "").trim();
        if (!property_type && !property_area && !property_details) return null;
        const entry: Record<string, unknown> = {};
        if (property_type && allowedTypes.has(property_type)) {
          entry.property_type = property_type;
        } else if (property_type) {
          entry.property_type = "others";
        }
        if (property_area) entry.property_area = property_area;
        if (property_details) entry.property_details = property_details;
        return entry;
      })
      .filter(Boolean) as Record<string, unknown>[];
    return rows.length ? rows : null;
  }

  private sanitizeResidentEntries(
    raw: Record<string, unknown>[] | null | undefined,
  ): Record<string, unknown>[] | null {
    if (!Array.isArray(raw)) return null;
    const allowed = new Set(["own_house", "rented", "sham_lot"]);
    const rows = raw
      .map((row) => {
        const resident_type = String(row?.resident_type || "")
          .trim()
          .toLowerCase();
        if (!allowed.has(resident_type)) return null;
        const entry: Record<string, unknown> = { resident_type };
        const own = String(row?.resident_ownership_status || "").trim();
        const other = String(row?.resident_ownership_other || "").trim();
        const details = String(row?.house_details || "").trim();
        if (own) entry.resident_ownership_status = own;
        if (other) entry.resident_ownership_other = other;
        if (details) entry.house_details = details;
        if (row?.house_area_marla != null && row.house_area_marla !== "") {
          entry.house_area_marla = String(row.house_area_marla);
        }
        if (
          resident_type === "rented" &&
          row?.rented_amount != null &&
          row.rented_amount !== ""
        ) {
          entry.rented_amount = String(row.rented_amount);
        }
        return entry;
      })
      .filter(Boolean) as Record<string, unknown>[];
    return rows.length ? rows : null;
  }

  private sanitizeVehicleEntries(
    raw: Record<string, unknown>[] | null | undefined,
  ): Record<string, unknown>[] | null {
    if (!Array.isArray(raw)) return null;
    const rows = raw
      .map((row) => {
        const vehicle_type = String(row?.vehicle_type || "").trim();
        if (!vehicle_type) return null;
        const entry: Record<string, unknown> = { vehicle_type };
        const qty = Number(row?.quantity);
        if (Number.isFinite(qty) && qty > 0) {
          entry.quantity = Math.floor(qty);
        }
        const details = String(row?.details || "").trim();
        if (details) entry.details = details;
        return entry;
      })
      .filter(Boolean) as Record<string, unknown>[];
    return rows.length ? rows : null;
  }

  private mapPersonFields(dto: CreateAidPersonDto | UpdateAidPersonDto) {
    const income =
      dto.monthly_income === undefined || dto.monthly_income === null || dto.monthly_income === ""
        ? undefined
        : String(dto.monthly_income);
    const numericField = (v: string | number | null | undefined) =>
      v === undefined || v === null || v === "" ? undefined : String(v);
    return {
      father_or_husband_name:
        dto.father_or_husband_name !== undefined
          ? dto.father_or_husband_name?.trim() || null
          : undefined,
      cnic_expiry:
        dto.cnic_expiry !== undefined ? dto.cnic_expiry || null : undefined,
      name_urdu:
        dto.name_urdu !== undefined ? dto.name_urdu?.trim() || null : undefined,
      caste: dto.caste !== undefined ? dto.caste?.trim() || null : undefined,
      phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
      phone_alternate:
        dto.phone_alternate !== undefined
          ? dto.phone_alternate?.trim() || null
          : undefined,
      photo_url:
        dto.photo_url !== undefined ? dto.photo_url?.trim() || null : undefined,
      photo_name:
        dto.photo_name !== undefined
          ? dto.photo_name?.trim() || null
          : undefined,
      gender: dto.gender !== undefined ? dto.gender : undefined,
      date_of_birth: dto.date_of_birth !== undefined ? dto.date_of_birth || null : undefined,
      marital_status: dto.marital_status !== undefined ? dto.marital_status : undefined,
      vulnerability:
        dto.vulnerability !== undefined
          ? dto.vulnerability?.trim() || null
          : undefined,
      occupation:
        dto.occupation !== undefined ? dto.occupation?.trim() || null : undefined,
      household_dependency:
        dto.household_dependency !== undefined
          ? dto.household_dependency?.trim() || null
          : undefined,
      education_level: dto.education_level !== undefined ? dto.education_level : undefined,
      literacy_status:
        dto.literacy_status !== undefined ? dto.literacy_status : undefined,
      literacy_category:
        dto.literacy_category !== undefined ? dto.literacy_category : undefined,
      student_class:
        dto.student_class !== undefined
          ? dto.student_class?.trim() || null
          : undefined,
      student_class_type:
        dto.student_class_type !== undefined
          ? dto.student_class_type?.trim() || null
          : undefined,
      student_class_name:
        dto.student_class_name !== undefined
          ? dto.student_class_name?.trim() || null
          : undefined,
      monthly_income: income === undefined ? undefined : income,
      has_disability:
        dto.has_disability !== undefined ? !!dto.has_disability : undefined,
      disability_type:
        dto.disability_type !== undefined
          ? dto.disability_type?.trim() || null
          : undefined,
      disability_certificate_url:
        dto.disability_certificate_url !== undefined
          ? dto.disability_certificate_url?.trim() || null
          : undefined,
      disability_certificate_name:
        dto.disability_certificate_name !== undefined
          ? dto.disability_certificate_name?.trim() || null
          : undefined,
      has_land: dto.has_land !== undefined ? !!dto.has_land : undefined,
      property_type:
        dto.property_type !== undefined ? dto.property_type : undefined,
      property_details:
        dto.property_details !== undefined
          ? dto.property_details?.trim() || null
          : undefined,
      property_area:
        dto.property_area !== undefined
          ? dto.property_area?.trim() || null
          : undefined,
      property_entries:
        dto.property_entries !== undefined
          ? this.sanitizePropertyEntries(dto.property_entries)
          : undefined,
      resident_type:
        dto.resident_type !== undefined ? dto.resident_type : undefined,
      resident_ownership_status:
        dto.resident_ownership_status !== undefined
          ? dto.resident_ownership_status?.trim() || null
          : undefined,
      resident_ownership_other:
        dto.resident_ownership_other !== undefined
          ? dto.resident_ownership_other?.trim() || null
          : undefined,
      rented_amount: numericField(dto.rented_amount),
      house_area_marla: numericField(dto.house_area_marla),
      house_details:
        dto.house_details !== undefined
          ? dto.house_details?.trim() || null
          : undefined,
      resident_entries:
        dto.resident_entries !== undefined
          ? this.sanitizeResidentEntries(dto.resident_entries)
          : undefined,
      has_livestock:
        dto.has_livestock !== undefined ? !!dto.has_livestock : undefined,
      livestock_entries:
        dto.livestock_entries !== undefined
          ? this.sanitizeLivestockEntries(dto.livestock_entries)
          : undefined,
      has_vehicle: dto.has_vehicle !== undefined ? !!dto.has_vehicle : undefined,
      vehicle_type:
        dto.vehicle_type !== undefined
          ? dto.vehicle_type?.trim() || null
          : undefined,
      vehicle_entries:
        dto.vehicle_entries !== undefined
          ? this.sanitizeVehicleEntries(dto.vehicle_entries)
          : undefined,
      necta_status:
        dto.necta_status !== undefined ? dto.necta_status : undefined,
      necta_document_url:
        dto.necta_document_url !== undefined
          ? dto.necta_document_url?.trim() || null
          : undefined,
      necta_document_name:
        dto.necta_document_name !== undefined
          ? dto.necta_document_name?.trim() || null
          : undefined,
      bisp_status: dto.bisp_status !== undefined ? dto.bisp_status : undefined,
      is_alive: dto.is_alive !== undefined ? dto.is_alive : undefined,
      health_notes:
        dto.health_notes !== undefined ? dto.health_notes?.trim() || null : undefined,
      address: dto.address !== undefined ? dto.address?.trim() || null : undefined,
      current_address:
        dto.current_address !== undefined
          ? dto.current_address?.trim() || null
          : undefined,
      city: dto.city !== undefined ? dto.city?.trim() || null : undefined,
      province:
        dto.province !== undefined ? dto.province?.trim() || null : undefined,
      district:
        dto.district !== undefined ? dto.district?.trim() || null : undefined,
      tehsil: dto.tehsil !== undefined ? dto.tehsil?.trim() || null : undefined,
      union_council:
        dto.union_council !== undefined
          ? dto.union_council?.trim() || null
          : undefined,
      landmark:
        dto.landmark !== undefined ? dto.landmark?.trim() || null : undefined,
      notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      is_active: dto.is_active !== undefined ? dto.is_active : undefined,
    };
  }

  async create(dto: CreateAidPersonDto, user?: User) {
    const cnic = this.normalizeCnic(dto.cnic);
    await this.assertUniqueCnic(cnic);

    // Archived person with same CNIC — reclaim instead of blocking
    if (cnic) {
      const archived = await this.findByCnicDigits(cnic, {
        archivedOnly: true,
      });
      if (archived) {
        return this.reactivateArchivedPerson(archived, dto, user);
      }
    }

    const mapped = this.mapPersonFields(dto);
    const row = this.personRepo.create({
      full_name: dto.full_name.trim(),
      father_or_husband_name: mapped.father_or_husband_name ?? null,
      cnic,
      cnic_expiry: mapped.cnic_expiry ?? null,
      name_urdu: mapped.name_urdu ?? null,
      caste: mapped.caste ?? null,
      phone: mapped.phone ?? null,
      phone_alternate: mapped.phone_alternate ?? null,
      photo_url: mapped.photo_url ?? null,
      photo_name: mapped.photo_name ?? null,
      gender: mapped.gender ?? null,
      date_of_birth: mapped.date_of_birth ?? null,
      marital_status: mapped.marital_status ?? null,
      vulnerability: mapped.vulnerability ?? null,
      occupation: mapped.occupation ?? null,
      household_dependency: mapped.household_dependency ?? null,
      education_level: mapped.education_level ?? null,
      literacy_status: mapped.literacy_status ?? null,
      literacy_category: mapped.literacy_category ?? null,
      student_class: mapped.student_class ?? null,
      student_class_type: mapped.student_class_type ?? null,
      student_class_name: mapped.student_class_name ?? null,
      monthly_income: mapped.monthly_income ?? null,
      has_disability: mapped.has_disability === true,
      disability_type: mapped.disability_type ?? null,
      disability_certificate_url: mapped.disability_certificate_url ?? null,
      disability_certificate_name: mapped.disability_certificate_name ?? null,
      has_land: mapped.has_land === true,
      property_type: mapped.has_land === true ? mapped.property_type ?? null : null,
      property_details:
        mapped.has_land === true ? mapped.property_details ?? null : null,
      property_area:
        mapped.has_land === true ? mapped.property_area ?? null : null,
      property_entries:
        mapped.has_land === true ? mapped.property_entries ?? null : null,
      resident_type: mapped.resident_type ?? null,
      resident_ownership_status: mapped.resident_ownership_status ?? null,
      resident_ownership_other: mapped.resident_ownership_other ?? null,
      rented_amount:
        mapped.resident_type === "rented" ? mapped.rented_amount ?? null : null,
      house_area_marla: mapped.house_area_marla ?? null,
      house_details: mapped.house_details ?? null,
      resident_entries: mapped.resident_entries ?? null,
      has_livestock: mapped.has_livestock === true,
      livestock_entries:
        mapped.has_livestock === true ? mapped.livestock_entries ?? null : null,
      has_vehicle: mapped.has_vehicle === true,
      vehicle_type:
        mapped.has_vehicle === true ? mapped.vehicle_type ?? null : null,
      vehicle_entries:
        mapped.has_vehicle === true ? mapped.vehicle_entries ?? null : null,
      necta_status: mapped.necta_status ?? null,
      necta_document_url: mapped.necta_document_url ?? null,
      necta_document_name: mapped.necta_document_name ?? null,
      bisp_status: mapped.bisp_status ?? null,
      is_alive: mapped.is_alive !== false,
      health_notes: mapped.health_notes ?? null,
      address: mapped.address ?? null,
      current_address: mapped.current_address ?? null,
      city: mapped.city ?? null,
      province: mapped.province ?? null,
      district: mapped.district ?? null,
      tehsil: mapped.tehsil ?? null,
      union_council: mapped.union_council ?? null,
      landmark: mapped.landmark ?? null,
      notes: mapped.notes ?? null,
      is_active: mapped.is_active !== false,
      created_by: user || null,
      updated_by: user || null,
    });
    return this.personRepo.save(row);
  }

  async findAll(params: {
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const qb = this.personRepo
      .createQueryBuilder("p")
      .where("p.is_archived = :archived", { archived: false })
      .orderBy("p.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const search = String(params.search || "").trim();
    if (search) {
      qb.andWhere(
        "(p.full_name ILIKE :q OR p.cnic ILIKE :q OR p.phone ILIKE :q OR p.city ILIKE :q)",
        { q: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(id: number) {
    const person = await this.personRepo.findOne({
      where: { id, is_archived: false },
      relations: ["created_by"],
    });
    if (!person) throw new NotFoundException(`Person #${id} not found`);
    (person as any).created_by = this.pickAuditActor((person as any).created_by);
    return person;
  }

  private buildFamilyTree(
    egoId: number,
    kinship: AidKinshipEdge[],
  ): Record<string, FamilyMemberRow[]> {
    const tree: Record<string, FamilyMemberRow[]> = {
      parents: [],
      spouse: [],
      children: [],
      brothers: [],
      sisters: [],
      siblings: [],
      grandparents: [],
      grandchildren: [],
      extended: [],
    };

    const push = (bucket: string, edge: AidKinshipEdge, person: AidPerson, relation: AidKinshipRelation) => {
      tree[bucket].push({
        edge_id: edge.id,
        relation_type: relation,
        notes: edge.notes,
        person,
      });
    };

    for (const edge of kinship) {
      let relative: AidPerson | null = null;
      let relation = edge.relation_type;

      if (edge.from_person_id === egoId) {
        relative = edge.to_person;
      } else if (edge.to_person_id === egoId) {
        // Incoming edge: invert common directed relations so tree is ego-centric
        relative = edge.from_person;
        const invert: Partial<Record<AidKinshipRelation, AidKinshipRelation>> = {
          [AidKinshipRelation.FATHER]: AidKinshipRelation.SON,
          [AidKinshipRelation.MOTHER]: AidKinshipRelation.SON,
          [AidKinshipRelation.SON]: AidKinshipRelation.FATHER,
          [AidKinshipRelation.DAUGHTER]: AidKinshipRelation.FATHER,
          [AidKinshipRelation.CHILD]: AidKinshipRelation.FATHER,
          [AidKinshipRelation.BROTHER]: AidKinshipRelation.BROTHER,
          [AidKinshipRelation.SISTER]: AidKinshipRelation.SISTER,
          [AidKinshipRelation.SIBLING]: AidKinshipRelation.SIBLING,
          [AidKinshipRelation.SPOUSE]: AidKinshipRelation.SPOUSE,
          [AidKinshipRelation.GRANDFATHER]: AidKinshipRelation.GRANDCHILD,
          [AidKinshipRelation.GRANDMOTHER]: AidKinshipRelation.GRANDCHILD,
          [AidKinshipRelation.MATERNAL_GRANDFATHER]:
            AidKinshipRelation.GRANDCHILD,
          [AidKinshipRelation.MATERNAL_GRANDMOTHER]:
            AidKinshipRelation.GRANDCHILD,
          [AidKinshipRelation.GRANDCHILD]: AidKinshipRelation.GRANDFATHER,
        };
        relation = invert[edge.relation_type] || edge.relation_type;
        if (
          (edge.relation_type === AidKinshipRelation.FATHER ||
            edge.relation_type === AidKinshipRelation.MOTHER) &&
          relative?.gender === AidPersonGender.FEMALE
        ) {
          relation = AidKinshipRelation.DAUGHTER;
        }
        if (
          (edge.relation_type === AidKinshipRelation.SON ||
            edge.relation_type === AidKinshipRelation.DAUGHTER ||
            edge.relation_type === AidKinshipRelation.CHILD) &&
          relative?.gender === AidPersonGender.FEMALE
        ) {
          relation = AidKinshipRelation.MOTHER;
        }
      }

      if (!relative) continue;

      switch (relation) {
        case AidKinshipRelation.FATHER:
        case AidKinshipRelation.MOTHER:
          push("parents", edge, relative, relation);
          break;
        case AidKinshipRelation.SPOUSE:
          push("spouse", edge, relative, relation);
          break;
        case AidKinshipRelation.SON:
        case AidKinshipRelation.DAUGHTER:
        case AidKinshipRelation.CHILD:
          push("children", edge, relative, relation);
          break;
        case AidKinshipRelation.BROTHER:
          push("brothers", edge, relative, relation);
          break;
        case AidKinshipRelation.SISTER:
          push("sisters", edge, relative, relation);
          break;
        case AidKinshipRelation.SIBLING:
          if (relative.gender === AidPersonGender.MALE) {
            push("brothers", edge, relative, AidKinshipRelation.BROTHER);
          } else if (relative.gender === AidPersonGender.FEMALE) {
            push("sisters", edge, relative, AidKinshipRelation.SISTER);
          } else {
            push("siblings", edge, relative, relation);
          }
          break;
        case AidKinshipRelation.GRANDFATHER:
        case AidKinshipRelation.GRANDMOTHER:
        case AidKinshipRelation.MATERNAL_GRANDFATHER:
        case AidKinshipRelation.MATERNAL_GRANDMOTHER:
          push("grandparents", edge, relative, relation);
          break;
        case AidKinshipRelation.GRANDCHILD:
          push("grandchildren", edge, relative, relation);
          break;
        default:
          push("extended", edge, relative, relation);
      }
    }

    return tree;
  }

  async findOneDetailed(id: number) {
    const person = await this.findOne(id);
    const kinship = await this.kinshipRepo.find({
      where: [
        { from_person_id: id, is_archived: false },
        { to_person_id: id, is_archived: false },
      ],
      relations: ["from_person", "to_person"],
      order: { id: "ASC" },
    });
    const memberships = await this.memberRepo.find({
      where: { person_id: id, is_archived: false },
      relations: ["household", "household.head_person"],
    });
    const applications = await this.applicationRepo.find({
      where: [
        { beneficiary_person_id: id, is_archived: false },
        { writer_person_id: id, is_archived: false },
      ],
      order: { created_at: "DESC" },
      take: 50,
    });

    const relatedIds = new Set<number>();
    for (const e of kinship) {
      relatedIds.add(e.from_person_id);
      relatedIds.add(e.to_person_id);
    }
    for (const m of memberships) {
      const mates = await this.memberRepo.find({
        where: { household_id: m.household_id, is_archived: false },
        relations: ["person"],
      });
      for (const mate of mates) relatedIds.add(mate.person_id);
      // Family head counts as a family member even if not on the membership roster
      const headId = (m.household as any)?.head_person_id;
      if (headId) relatedIds.add(Number(headId));
    }
    relatedIds.delete(id);

    const relatedPeople =
      relatedIds.size > 0
        ? await this.personRepo.find({
            where: { id: In([...relatedIds]), is_archived: false },
          })
        : [];

    const households = [];
    for (const m of memberships) {
      if (!m.household) continue;
      const mates = await this.memberRepo.find({
        where: { household_id: m.household_id, is_archived: false },
        relations: ["person"],
        order: { id: "ASC" },
      });
      households.push({
        ...m.household,
        membership_id: m.id,
        role_in_household: m.role_in_household,
        members: mates,
      });
    }

    const family_tree = this.buildFamilyTree(id, kinship);
    // Beneficiary (ego) + family head + relatives all count as family members
    const total_members = relatedPeople.length + 1;
    const family_counts = {
      parents: family_tree.parents.length,
      spouse: family_tree.spouse.length,
      children: family_tree.children.length,
      brothers: family_tree.brothers.length,
      sisters: family_tree.sisters.length,
      siblings: family_tree.siblings.length,
      grandparents: family_tree.grandparents.length,
      grandchildren: family_tree.grandchildren.length,
      extended: family_tree.extended.length,
      total_linked: relatedPeople.length,
      total_members,
    };

    return {
      person,
      kinship,
      family_tree,
      family_counts,
      households,
      applications,
      related_people: relatedPeople,
    };
  }

  async update(id: number, dto: UpdateAidPersonDto, user?: User) {
    const person = await this.findOne(id);
    if (dto.cnic !== undefined) {
      const cnic = this.normalizeCnic(dto.cnic);
      await this.assertUniqueCnic(cnic, id);
      person.cnic = cnic;
    }
    if (dto.full_name !== undefined) person.full_name = dto.full_name.trim();
    const mapped = this.mapPersonFields(dto);
    if (mapped.father_or_husband_name !== undefined) {
      person.father_or_husband_name = mapped.father_or_husband_name;
    }
    if (mapped.cnic_expiry !== undefined) person.cnic_expiry = mapped.cnic_expiry;
    if (mapped.name_urdu !== undefined) person.name_urdu = mapped.name_urdu;
    if (mapped.caste !== undefined) person.caste = mapped.caste;
    if (mapped.phone !== undefined) person.phone = mapped.phone;
    if (mapped.phone_alternate !== undefined) {
      person.phone_alternate = mapped.phone_alternate;
    }
    if (mapped.photo_url !== undefined) person.photo_url = mapped.photo_url;
    if (mapped.photo_name !== undefined) person.photo_name = mapped.photo_name;
    if (mapped.gender !== undefined) person.gender = mapped.gender;
    if (mapped.date_of_birth !== undefined) person.date_of_birth = mapped.date_of_birth;
    if (mapped.marital_status !== undefined) person.marital_status = mapped.marital_status;
    if (mapped.vulnerability !== undefined) person.vulnerability = mapped.vulnerability;
    if (mapped.occupation !== undefined) person.occupation = mapped.occupation;
    if (mapped.household_dependency !== undefined) {
      person.household_dependency = mapped.household_dependency;
    }
    if (mapped.education_level !== undefined) person.education_level = mapped.education_level;
    if (mapped.literacy_status !== undefined) {
      person.literacy_status = mapped.literacy_status;
    }
    if (mapped.literacy_category !== undefined) {
      person.literacy_category = mapped.literacy_category;
    }
    if (mapped.student_class !== undefined) {
      person.student_class = mapped.student_class;
    }
    if (mapped.student_class_type !== undefined) {
      person.student_class_type = mapped.student_class_type;
    }
    if (mapped.student_class_name !== undefined) {
      person.student_class_name = mapped.student_class_name;
    }
    if (mapped.monthly_income !== undefined) person.monthly_income = mapped.monthly_income;
    if (mapped.has_disability !== undefined) {
      person.has_disability = mapped.has_disability;
    }
    if (mapped.disability_type !== undefined) {
      person.disability_type = mapped.disability_type;
    }
    if (mapped.disability_certificate_url !== undefined) {
      person.disability_certificate_url = mapped.disability_certificate_url;
    }
    if (mapped.disability_certificate_name !== undefined) {
      person.disability_certificate_name = mapped.disability_certificate_name;
    }
    if (mapped.has_land !== undefined) {
      person.has_land = mapped.has_land;
      if (!mapped.has_land) {
        person.property_type = null;
        person.property_details = null;
        person.property_area = null;
        person.property_entries = null;
      }
    }
    if (mapped.property_type !== undefined && person.has_land) {
      person.property_type = mapped.property_type;
    }
    if (mapped.property_details !== undefined && person.has_land) {
      person.property_details = mapped.property_details;
    }
    if (mapped.property_area !== undefined && person.has_land) {
      person.property_area = mapped.property_area;
    }
    if (mapped.property_entries !== undefined && person.has_land) {
      person.property_entries = mapped.property_entries;
      const first = mapped.property_entries?.[0] as
        | Record<string, unknown>
        | undefined;
      if (first) {
        if (first.property_type != null) {
          person.property_type = first.property_type as any;
        }
        if (first.property_details != null) {
          person.property_details = String(first.property_details);
        }
        if (first.property_area != null) {
          person.property_area = String(first.property_area);
        }
      }
    }
    if (mapped.resident_type !== undefined) {
      person.resident_type = mapped.resident_type;
      if (mapped.resident_type !== "rented") {
        person.rented_amount = null;
      }
    }
    if (mapped.resident_ownership_status !== undefined) {
      person.resident_ownership_status = mapped.resident_ownership_status;
    }
    if (mapped.resident_ownership_other !== undefined) {
      person.resident_ownership_other = mapped.resident_ownership_other;
    }
    if (mapped.rented_amount !== undefined && person.resident_type === "rented") {
      person.rented_amount = mapped.rented_amount;
    }
    if (mapped.house_area_marla !== undefined) {
      person.house_area_marla = mapped.house_area_marla;
    }
    if (mapped.house_details !== undefined) {
      person.house_details = mapped.house_details;
    }
    if (mapped.resident_entries !== undefined) {
      person.resident_entries = mapped.resident_entries;
      const first = mapped.resident_entries?.[0] as
        | Record<string, unknown>
        | undefined;
      if (first) {
        if (first.resident_type != null) {
          person.resident_type = first.resident_type as any;
        }
        if (first.resident_ownership_status != null) {
          person.resident_ownership_status = String(
            first.resident_ownership_status,
          );
        }
        if (first.resident_ownership_other != null) {
          person.resident_ownership_other = String(
            first.resident_ownership_other,
          );
        }
        if (first.house_details != null) {
          person.house_details = String(first.house_details);
        }
        if (first.house_area_marla != null) {
          person.house_area_marla = String(first.house_area_marla);
        }
        if (first.rented_amount != null) {
          person.rented_amount = String(first.rented_amount);
        }
      }
    }
    if (mapped.has_livestock !== undefined) {
      person.has_livestock = mapped.has_livestock;
      if (!mapped.has_livestock) {
        person.livestock_entries = null;
      }
    }
    if (mapped.livestock_entries !== undefined && person.has_livestock) {
      person.livestock_entries = mapped.livestock_entries;
    }
    if (mapped.has_vehicle !== undefined) {
      person.has_vehicle = mapped.has_vehicle;
      if (!mapped.has_vehicle) {
        person.vehicle_type = null;
        person.vehicle_entries = null;
      }
    }
    if (mapped.vehicle_type !== undefined && person.has_vehicle) {
      person.vehicle_type = mapped.vehicle_type;
    }
    if (mapped.vehicle_entries !== undefined && person.has_vehicle) {
      person.vehicle_entries = mapped.vehicle_entries;
      const first = mapped.vehicle_entries?.[0] as
        | Record<string, unknown>
        | undefined;
      if (first?.vehicle_type != null) {
        person.vehicle_type = String(first.vehicle_type);
      }
    }
    if (mapped.necta_status !== undefined) {
      person.necta_status = mapped.necta_status;
    }
    if (mapped.necta_document_url !== undefined) {
      person.necta_document_url = mapped.necta_document_url;
    }
    if (mapped.necta_document_name !== undefined) {
      person.necta_document_name = mapped.necta_document_name;
    }
    if (mapped.bisp_status !== undefined) {
      person.bisp_status = mapped.bisp_status;
    }
    if (mapped.is_alive !== undefined) person.is_alive = mapped.is_alive;
    if (mapped.health_notes !== undefined) person.health_notes = mapped.health_notes;
    if (mapped.address !== undefined) person.address = mapped.address;
    if (mapped.current_address !== undefined) {
      person.current_address = mapped.current_address;
    }
    if (mapped.city !== undefined) person.city = mapped.city;
    if (mapped.province !== undefined) person.province = mapped.province;
    if (mapped.district !== undefined) person.district = mapped.district;
    if (mapped.tehsil !== undefined) person.tehsil = mapped.tehsil;
    if (mapped.union_council !== undefined) {
      person.union_council = mapped.union_council;
    }
    if (mapped.landmark !== undefined) person.landmark = mapped.landmark;
    if (mapped.notes !== undefined) person.notes = mapped.notes;
    if (mapped.is_active !== undefined) person.is_active = mapped.is_active;
    person.updated_by = user || null;
    return this.personRepo.save(person);
  }

  async softDelete(id: number, user?: User) {
    const person = await this.findOne(id);
    person.is_archived = true;
    person.is_active = false;
    person.updated_by = user || null;
    // Keep CNIC on the row for history; uniqueness is only among active rows
    // (uq_aid_people_cnic_active). Reclaim path reactivates this record if needed.
    return this.personRepo.save(person);
  }

  async addKinship(fromPersonId: number, dto: CreateAidKinshipDto, user?: User) {
    await this.findOne(fromPersonId);
    await this.findOne(dto.to_person_id);
    if (fromPersonId === dto.to_person_id) {
      throw new BadRequestException("Cannot link a person to themselves");
    }
    const existing = await this.kinshipRepo.findOne({
      where: {
        from_person_id: fromPersonId,
        to_person_id: dto.to_person_id,
        relation_type: dto.relation_type,
        is_archived: false,
      },
    });
    if (existing) {
      throw new ConflictException("This kinship edge already exists");
    }
    const edge = this.kinshipRepo.create({
      from_person_id: fromPersonId,
      to_person_id: dto.to_person_id,
      relation_type: dto.relation_type,
      notes: dto.notes?.trim() || null,
      created_by: user || null,
      updated_by: user || null,
    });
    return this.kinshipRepo.save(edge);
  }

  /** Create (or link) a relative and attach as family member of ego. */
  async addFamilyMember(
    fromPersonId: number,
    dto: CreateAidFamilyMemberDto,
    user?: User,
  ) {
    await this.findOne(fromPersonId);
    let toPersonId = dto.existing_person_id;
    if (!toPersonId && dto.person) {
      try {
        const created = await this.create(dto.person, user);
        toPersonId = created.id;
      } catch (err) {
        // Same person already created as applicant/writer — reuse by CNIC
        if (err instanceof ConflictException) {
          const cnic = this.normalizeCnic(dto.person.cnic);
          if (cnic) {
            const existing = await this.findByCnicDigits(cnic, {
              activeOnly: true,
            });
            if (existing) toPersonId = existing.id;
          }
        }
        if (!toPersonId) throw err;
      }
    }
    if (!toPersonId) {
      throw new BadRequestException(
        "Provide existing_person_id or person payload for the relative",
      );
    }
    const edge = await this.addKinship(
      fromPersonId,
      {
        to_person_id: toPersonId,
        relation_type: dto.relation_type,
        notes: dto.notes,
      },
      user,
    );
    const person = await this.findOne(toPersonId);
    return { edge, person };
  }

  async removeKinship(edgeId: number, user?: User) {
    const edge = await this.kinshipRepo.findOne({
      where: { id: edgeId, is_archived: false },
    });
    if (!edge) throw new NotFoundException(`Kinship edge #${edgeId} not found`);
    edge.is_archived = true;
    edge.updated_by = user || null;
    return this.kinshipRepo.save(edge);
  }

  async listForLookup(params?: EntityLookupParams): Promise<LookupOption[]> {
    return listEntityLookup(
      this.personRepo,
      {
        profile: LOOKUP_PROFILES.aid_people,
        searchFields: ["full_name", "cnic", "phone"],
        activeColumn: "is_active",
        labelFallback: (row) => `#${row.id}`,
      },
      params,
    );
  }
}
