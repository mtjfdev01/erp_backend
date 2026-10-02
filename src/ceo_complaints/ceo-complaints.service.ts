import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CeoComplaint } from "./entities/ceo-complaint.entity";
import { CreateCeoComplaintDto } from "./dto/create-ceo-complaint.dto";
import {
  ASLAB_BRANCHES,
  CeoComplaintCategory,
  CeoComplaintOrganization,
  CeoComplaintStatus,
  CeoComplaintSubmissionChannel,
} from "./ceo-complaints.constants";
import { generateCeoComplaintNumber } from "./utils/ceo-complaint-code.util";
import { User } from "src/users/user.entity";

@Injectable()
export class CeoComplaintsService {
  constructor(
    @InjectRepository(CeoComplaint)
    private readonly repo: Repository<CeoComplaint>,
  ) {}

  private validatePayload(dto: CreateCeoComplaintDto) {
    if (dto.organization === CeoComplaintOrganization.ASLAB) {
      const branch = String(dto.branch || "").trim();
      if (!branch) {
        throw new BadRequestException("Branch is required for Aslab");
      }
      const allowed = ASLAB_BRANCHES.some((b) => b.value === branch);
      if (!allowed) {
        throw new BadRequestException("Invalid Aslab branch");
      }
    }

    if (dto.category === CeoComplaintCategory.OTHER) {
      const other = String(dto.category_other || "").trim();
      if (!other) {
        throw new BadRequestException(
          "Please describe the category when Other is selected",
        );
      }
    }
  }

  private async createUniqueNumber(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const complaint_number = generateCeoComplaintNumber();
      const existing = await this.repo.findOne({
        where: { complaint_number, is_archived: false },
        select: ["id"],
      });
      if (!existing) return complaint_number;
    }
    throw new BadRequestException("Could not generate complaint number");
  }

  async createPublic(dto: CreateCeoComplaintDto) {
    this.validatePayload(dto);
    const complaint_number = await this.createUniqueNumber();

    const row = this.repo.create({
      complaint_number,
      organization: dto.organization,
      branch:
        dto.organization === CeoComplaintOrganization.ASLAB
          ? String(dto.branch).trim()
          : null,
      complainant_type: dto.complainant_type,
      complainant_name: dto.complainant_name?.trim() || null,
      contact_number: dto.contact_number?.trim() || null,
      category: dto.category,
      category_other:
        dto.category === CeoComplaintCategory.OTHER
          ? String(dto.category_other).trim()
          : null,
      details: dto.details.trim(),
      status: CeoComplaintStatus.SUBMITTED,
      submission_channel: CeoComplaintSubmissionChannel.WEBSITE,
    });

    await this.repo.save(row);
    return { complaint_number: row.complaint_number };
  }

  async createStaff(dto: CreateCeoComplaintDto, user?: User | null) {
    this.validatePayload(dto);
    const complaint_number = await this.createUniqueNumber();

    const row = this.repo.create({
      complaint_number,
      organization: dto.organization,
      branch:
        dto.organization === CeoComplaintOrganization.ASLAB
          ? String(dto.branch).trim()
          : null,
      complainant_type: dto.complainant_type,
      complainant_name: dto.complainant_name?.trim() || null,
      contact_number: dto.contact_number?.trim() || null,
      category: dto.category,
      category_other:
        dto.category === CeoComplaintCategory.OTHER
          ? String(dto.category_other).trim()
          : null,
      details: dto.details.trim(),
      status: dto.status || CeoComplaintStatus.SUBMITTED,
      submission_channel: CeoComplaintSubmissionChannel.DMS,
      ...(user?.id && user.id > 0
        ? { created_by: { id: user.id } as any }
        : {}),
    });

    const saved = await this.repo.save(row);
    return {
      success: true,
      message: "Complaint submitted successfully",
      data: saved,
    };
  }

  async trackByNumber(complaintNumber: string) {
    const code = String(complaintNumber || "").trim().toUpperCase();
    if (!code) {
      throw new BadRequestException("complaint_number is required");
    }

    const row = await this.repo.findOne({
      where: { complaint_number: code, is_archived: false },
      select: [
        "id",
        "complaint_number",
        "organization",
        "status",
        "created_at",
        "updated_at",
      ],
    });

    if (!row) {
      throw new NotFoundException("Complaint not found");
    }

    return {
      complaint_number: row.complaint_number,
      organization: row.organization,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async search(payload: Record<string, any> = {}) {
    const pagination = payload.pagination || {};
    const page = Math.max(1, Number(pagination.page) || 1);
    let pageSize = Number(pagination.pageSize);
    if (!Number.isFinite(pageSize)) pageSize = 10;
    if (pagination.pageSize === 0) pageSize = 0;

    const sortField = [
      "id",
      "created_at",
      "updated_at",
      "status",
      "organization",
      "complaint_number",
    ].includes(pagination.sortField)
      ? pagination.sortField
      : "created_at";
    const sortOrder =
      String(pagination.sortOrder || "DESC").toUpperCase() === "ASC"
        ? "ASC"
        : "DESC";

    const filters = payload.filters || payload;
    const qb = this.repo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.created_by", "created_by")
      .where("c.is_archived = false");

    if (filters.organization) {
      qb.andWhere("c.organization = :organization", {
        organization: filters.organization,
      });
    }
    if (filters.branch) {
      qb.andWhere("c.branch = :branch", { branch: filters.branch });
    }
    if (filters.complainant_type) {
      qb.andWhere("c.complainant_type = :complainant_type", {
        complainant_type: filters.complainant_type,
      });
    }
    if (filters.category) {
      qb.andWhere("c.category = :category", { category: filters.category });
    }
    if (filters.status) {
      qb.andWhere("c.status = :status", { status: filters.status });
    }
    if (filters.submission_channel) {
      qb.andWhere("c.submission_channel = :submission_channel", {
        submission_channel: filters.submission_channel,
      });
    }
    if (filters.search) {
      const term = `%${String(filters.search).trim()}%`;
      qb.andWhere(
        `(c.complaint_number ILIKE :term OR c.complainant_name ILIKE :term OR c.contact_number ILIKE :term OR c.details ILIKE :term)`,
        { term },
      );
    }

    const exactDate = String(filters.date || "").trim();
    const rangeStart = String(filters.start_date || "").trim();
    const rangeEnd = String(filters.end_date || "").trim();
    if (rangeStart && rangeEnd) {
      qb.andWhere(`DATE(c.created_at) BETWEEN :rangeStart AND :rangeEnd`, {
        rangeStart,
        rangeEnd,
      });
    } else if (rangeStart) {
      qb.andWhere(`DATE(c.created_at) >= :rangeStart`, { rangeStart });
    } else if (rangeEnd) {
      qb.andWhere(`DATE(c.created_at) <= :rangeEnd`, { rangeEnd });
    } else if (exactDate) {
      qb.andWhere(`DATE(c.created_at) = :exactDate`, { exactDate });
    }

    const total = await qb.clone().getCount();
    qb.orderBy(`c.${sortField}`, sortOrder);
    if (pageSize > 0) {
      qb.skip((page - 1) * pageSize).take(pageSize);
    }

    const rows = await qb.getMany();
    const totalPages =
      pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

    return {
      data: rows,
      pagination: { page, pageSize, total, totalPages },
    };
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({
      where: { id, is_archived: false },
      relations: ["created_by", "updated_by"],
    });
    if (!row) {
      throw new NotFoundException("Complaint not found");
    }
    return {
      success: true,
      data: row,
    };
  }
}
