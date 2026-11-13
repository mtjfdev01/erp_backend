import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  AidApplicationStatus,
  AidHouseholdRole,
  AidPersonGender,
  AidRequestType,
} from "../aid.enums";
import { AidApplication } from "../entities/aid-application.entity";
import { AidHousehold } from "../entities/aid-household.entity";
import { AidHouseholdMember } from "../entities/aid-household-member.entity";
import { AidKinshipEdge } from "../entities/aid-kinship-edge.entity";
import { AidPerson } from "../entities/aid-person.entity";

/** Clinic category code for MTJ health / AAS subsidy patients. */
export const ASK_CLINIC_HEALTH_BENEFICIARY_CODE = "PR-HEA-8771";
export const ASK_CLINIC_HEALTH_PROGRAM =
  "MTJ Foundation Health Welfare Program";

export type AskClinicDmsRole =
  | "beneficiary"
  | "family_head"
  | "family_member"
  | "writer"
  | "registered_person";

export type AskClinicBeneficiaryResult = {
  id: number;
  display_id: string;
  beneficiaryCode: string | null;
  fullName: string;
  guardianName: string | null;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth: string | null;
  age: number | null;
  cnic: string | null;
  mobileNumber: string | null;
  alternatePhone: string | null;
  address: string | null;
  city: string | null;
  program: string | null;
  eligibilityStatus: "VERIFIED" | "ACTIVE" | "APPROVED" | "REGISTERED";
  /** Primary DMS registration role for this person. */
  registrationStatus: AskClinicDmsRole;
  /** All roles this person holds in DMS. */
  roles: AskClinicDmsRole[];
  /** Household role label when applicable (head, spouse, child, …). */
  householdRole: string | null;
  /** Recent aid application summary (health-focused first). */
  applications: Array<{
    application_no: string;
    status: string;
    requested_aid_type: string;
    aid_program: string | null;
  }>;
};

const HEALTH_AID_TYPES = new Set<string>([
  AidRequestType.HEALTH,
  AidRequestType.AAS_LAB_DIAGNOSTICS,
]);

const VERIFIED_APP_STATUSES = new Set<string>([
  AidApplicationStatus.SUCCESSFUL,
  AidApplicationStatus.DELIVERED,
]);

const ACTIVE_APP_STATUSES = new Set<string>([
  AidApplicationStatus.SUBMITTED,
  AidApplicationStatus.UNDER_REVIEW,
  AidApplicationStatus.VERIFICATION_COMPLETED,
  AidApplicationStatus.MANAGER_REVIEW,
  AidApplicationStatus.MEAL_APPROVAL_REQUIRED,
  AidApplicationStatus.CEO_APPROVAL_REQUIRED,
]);

@Injectable()
export class AskClinicBeneficiariesService {
  constructor(
    @InjectRepository(AidPerson)
    private readonly personRepo: Repository<AidPerson>,
    @InjectRepository(AidApplication)
    private readonly appRepo: Repository<AidApplication>,
    @InjectRepository(AidHousehold)
    private readonly householdRepo: Repository<AidHousehold>,
    @InjectRepository(AidHouseholdMember)
    private readonly memberRepo: Repository<AidHouseholdMember>,
    @InjectRepository(AidKinshipEdge)
    private readonly kinshipRepo: Repository<AidKinshipEdge>,
  ) {}

  async search(
    queryRaw: string | undefined,
    limit = 20,
  ): Promise<AskClinicBeneficiaryResult[]> {
    const query = String(queryRaw || "").trim();
    if (query.length < 2) {
      throw new BadRequestException(
        "query must be at least 2 characters (name, CNIC, or mobile)",
      );
    }

    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    const digits = query.replace(/\D/g, "");
    const qb = this.personRepo
      .createQueryBuilder("p")
      .where("p.is_archived = :archived", { archived: false })
      .andWhere("p.is_active = :active", { active: true });

    if (digits.length >= 10) {
      // CNIC (13) or mobile (11) — match digit-stripped columns.
      qb.andWhere(
        `(
          REPLACE(REPLACE(COALESCE(p.cnic, ''), '-', ''), ' ', '') LIKE :digits
          OR REPLACE(REPLACE(REPLACE(COALESCE(p.phone, ''), '-', ''), ' ', ''), '+', '') LIKE :digits
          OR REPLACE(REPLACE(REPLACE(COALESCE(p.phone_alternate, ''), '-', ''), ' ', ''), '+', '') LIKE :digits
        )`,
        { digits: `%${digits}%` },
      );
    } else {
      qb.andWhere(
        `(
          p.full_name ILIKE :q
          OR p.cnic ILIKE :q
          OR p.phone ILIKE :q
          OR p.phone_alternate ILIKE :q
          OR p.father_or_husband_name ILIKE :q
        )`,
        { q: `%${query}%` },
      );
    }

    qb.orderBy("p.updated_at", "DESC").take(take);
    const people = await qb.getMany();
    if (!people.length) return [];

    return this.enrichPeople(people);
  }

  private async enrichPeople(
    people: AidPerson[],
  ): Promise<AskClinicBeneficiaryResult[]> {
    const ids = people.map((p) => p.id);

    const [asBeneficiary, asWriter, asHead, memberships, kinshipHits] =
      await Promise.all([
        this.appRepo.find({
          where: { beneficiary_person_id: In(ids), is_archived: false },
          select: [
            "id",
            "application_no",
            "beneficiary_person_id",
            "writer_person_id",
            "status",
            "requested_aid_type",
            "aid_program",
          ],
          order: { updated_at: "DESC" },
          take: 500,
        }),
        this.appRepo.find({
          where: { writer_person_id: In(ids), is_archived: false },
          select: [
            "id",
            "application_no",
            "beneficiary_person_id",
            "writer_person_id",
            "status",
            "requested_aid_type",
            "aid_program",
          ],
          order: { updated_at: "DESC" },
          take: 500,
        }),
        this.householdRepo.find({
          where: { head_person_id: In(ids), is_archived: false },
          select: ["id", "head_person_id"],
        }),
        this.memberRepo.find({
          where: { person_id: In(ids), is_archived: false },
          select: ["id", "person_id", "role_in_household", "household_id"],
        }),
        this.kinshipRepo
          .createQueryBuilder("k")
          .select("k.from_person_id", "from_person_id")
          .addSelect("k.to_person_id", "to_person_id")
          .where("k.is_archived = false")
          .andWhere(
            "(k.from_person_id IN (:...ids) OR k.to_person_id IN (:...ids))",
            { ids },
          )
          .getRawMany<{ from_person_id: number; to_person_id: number }>(),
      ]);

    const beneficiaryAppByPerson = new Map<number, AidApplication[]>();
    for (const app of asBeneficiary) {
      const list = beneficiaryAppByPerson.get(app.beneficiary_person_id) || [];
      list.push(app);
      beneficiaryAppByPerson.set(app.beneficiary_person_id, list);
    }

    const writerOnlyAppByPerson = new Map<number, AidApplication[]>();
    for (const app of asWriter) {
      if (app.writer_person_id === app.beneficiary_person_id) continue;
      const list = writerOnlyAppByPerson.get(app.writer_person_id) || [];
      list.push(app);
      writerOnlyAppByPerson.set(app.writer_person_id, list);
    }

    const headIds = new Set(
      asHead
        .map((h) => h.head_person_id)
        .filter((id): id is number => Number.isFinite(id) && id > 0),
    );

    const membershipByPerson = new Map<number, AidHouseholdMember[]>();
    for (const m of memberships) {
      const list = membershipByPerson.get(m.person_id) || [];
      list.push(m);
      membershipByPerson.set(m.person_id, list);
    }

    const kinshipPersonIds = new Set<number>();
    for (const row of kinshipHits) {
      kinshipPersonIds.add(Number(row.from_person_id));
      kinshipPersonIds.add(Number(row.to_person_id));
    }

    return people.map((person) =>
      this.toResult(
        person,
        beneficiaryAppByPerson.get(person.id) || [],
        writerOnlyAppByPerson.get(person.id) || [],
        headIds.has(person.id),
        membershipByPerson.get(person.id) || [],
        kinshipPersonIds.has(person.id),
      ),
    );
  }

  private toResult(
    person: AidPerson,
    beneficiaryApps: AidApplication[],
    writerApps: AidApplication[],
    isHouseholdHead: boolean,
    memberships: AidHouseholdMember[],
    inKinship: boolean,
  ): AskClinicBeneficiaryResult {
    const roles = new Set<AskClinicDmsRole>();

    if (beneficiaryApps.length) roles.add("beneficiary");
    if (isHouseholdHead) roles.add("family_head");
    if (
      memberships.some((m) => m.role_in_household === AidHouseholdRole.HEAD)
    ) {
      roles.add("family_head");
    }
    if (
      memberships.some((m) => m.role_in_household !== AidHouseholdRole.HEAD) ||
      (inKinship && !isHouseholdHead)
    ) {
      roles.add("family_member");
    }
    if (writerApps.length) roles.add("writer");
    if (!roles.size) roles.add("registered_person");

    const rolePriority: AskClinicDmsRole[] = [
      "beneficiary",
      "family_head",
      "writer",
      "family_member",
      "registered_person",
    ];
    const rolesList = rolePriority.filter((r) => roles.has(r));
    const registrationStatus = rolesList[0] || "registered_person";

    const headMembership = memberships.find(
      (m) => m.role_in_household === AidHouseholdRole.HEAD,
    );
    const otherMembership = memberships.find(
      (m) => m.role_in_household !== AidHouseholdRole.HEAD,
    );
    const householdRole = isHouseholdHead
      ? AidHouseholdRole.HEAD
      : headMembership?.role_in_household ||
        otherMembership?.role_in_household ||
        null;

    const healthApps = beneficiaryApps.filter((a) =>
      HEALTH_AID_TYPES.has(String(a.requested_aid_type || "")),
    );
    const healthStatuses = healthApps.map((a) => String(a.status));
    let eligibilityStatus: AskClinicBeneficiaryResult["eligibilityStatus"] =
      "REGISTERED";
    if (healthStatuses.some((s) => VERIFIED_APP_STATUSES.has(s))) {
      eligibilityStatus = "VERIFIED";
    } else if (
      healthStatuses.some(
        (s) =>
          ACTIVE_APP_STATUSES.has(s) ||
          s === AidApplicationStatus.SUCCESSFUL ||
          s === AidApplicationStatus.DELIVERED,
      )
    ) {
      eligibilityStatus = "ACTIVE";
    } else if (
      beneficiaryApps.some((a) =>
        VERIFIED_APP_STATUSES.has(String(a.status)),
      )
    ) {
      eligibilityStatus = "APPROVED";
    } else if (beneficiaryApps.length) {
      eligibilityStatus = "ACTIVE";
    }

    const isHealthBeneficiary = healthApps.length > 0;
    const beneficiaryCode = isHealthBeneficiary
      ? ASK_CLINIC_HEALTH_BENEFICIARY_CODE
      : null;
    const program = isHealthBeneficiary
      ? ASK_CLINIC_HEALTH_PROGRAM
      : beneficiaryApps[0]?.aid_program ||
        beneficiaryApps[0]?.requested_aid_type ||
        null;

    const appsForPayload = [...healthApps, ...beneficiaryApps]
      .filter(
        (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i,
      )
      .slice(0, 5)
      .map((a) => ({
        application_no: a.application_no,
        status: String(a.status),
        requested_aid_type: String(a.requested_aid_type),
        aid_program: a.aid_program || null,
      }));

    return {
      id: person.id,
      display_id: beneficiaryCode || `DMS-PERSON-${person.id}`,
      beneficiaryCode,
      fullName: person.full_name,
      guardianName: person.father_or_husband_name || null,
      gender: this.mapGender(person.gender),
      dateOfBirth: person.date_of_birth || null,
      age: this.calcAge(person.date_of_birth),
      cnic: this.formatCnic(person.cnic),
      mobileNumber: person.phone || null,
      alternatePhone: person.phone_alternate || null,
      address: person.current_address || person.address || null,
      city: person.city || person.district || null,
      program,
      eligibilityStatus,
      registrationStatus,
      roles: rolesList,
      householdRole,
      applications: appsForPayload,
    };
  }

  private mapGender(
    gender: AidPersonGender | null | undefined,
  ): "MALE" | "FEMALE" | "OTHER" {
    switch (gender) {
      case AidPersonGender.FEMALE:
        return "FEMALE";
      case AidPersonGender.OTHER:
        return "OTHER";
      case AidPersonGender.MALE:
      default:
        return "MALE";
    }
  }

  private calcAge(dob: string | null | undefined): number | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    return age >= 0 && age < 150 ? age : null;
  }

  private formatCnic(cnic: string | null | undefined): string | null {
    if (!cnic) return null;
    const digits = String(cnic).replace(/\D/g, "");
    if (digits.length === 13) {
      return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
    }
    return String(cnic).trim() || null;
  }
}
