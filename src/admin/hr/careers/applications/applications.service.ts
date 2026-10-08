import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateApplicationDto } from "./dto/create-application.dto";
import { UpdateApplicationDto } from "./dto/update-application.dto";
import {
  Application,
  ApplicationStatus,
  JobApplicationDisclosure,
  JobApplicationEducationRow,
  JobApplicationExperienceRow,
} from "./entities/application.entity";
import { ResumeS3Service } from "../../resume_collection/resume-s3.service";
import { Job } from "../jobs/entities/job.entity";

export type ApplicationListFilters = {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: "ASC" | "DESC";
  job_id?: number;
  status?: string;
  search?: string;
  gender?: string;
  city?: string;
  country?: string;
  cnic?: string;
  has_work_experience?: boolean;
  from_date?: string;
  to_date?: string;
};

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly resumeS3: ResumeS3Service,
  ) {}

  private buildApplicantName(dto: CreateApplicationDto | UpdateApplicationDto) {
    const fromParts = [dto.first_name, dto.last_name]
      .map((p) => (p || "").trim())
      .filter(Boolean)
      .join(" ");
    if (fromParts) return fromParts;
    if (dto.applicant_name?.trim()) return dto.applicant_name.trim();
    return null;
  }

  private normalizeEducation(
    rows?: Record<string, any>[],
  ): JobApplicationEducationRow[] {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        type: r.type != null ? String(r.type) : "",
        program: r.program != null ? String(r.program) : "",
        specialization:
          r.specialization != null ? String(r.specialization) : "",
        yearOfCompletion:
          r.yearOfCompletion != null ? String(r.yearOfCompletion) : "",
        resultStatus: r.resultStatus != null ? String(r.resultStatus) : "",
      }));
  }

  private normalizeExperience(
    rows?: Record<string, any>[],
  ): JobApplicationExperienceRow[] {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        company: r.company != null ? String(r.company) : "",
        jobTitle: r.jobTitle != null ? String(r.jobTitle) : "",
        description: r.description != null ? String(r.description) : "",
        location: r.location != null ? String(r.location) : "",
        totalExperience:
          r.totalExperience != null ? String(r.totalExperience) : "",
      }));
  }

  private normalizeDisclosure(
    value?: Record<string, any>,
  ): JobApplicationDisclosure {
    if (!value || typeof value !== "object") return {};
    return {
      dismissed: value.dismissed != null ? String(value.dismissed) : undefined,
      serviceBond:
        value.serviceBond != null ? String(value.serviceBond) : undefined,
      criminalCharges:
        value.criminalCharges != null
          ? String(value.criminalCharges)
          : undefined,
      relativeWorking:
        value.relativeWorking != null
          ? String(value.relativeWorking)
          : undefined,
      approachEmployer:
        value.approachEmployer != null
          ? String(value.approachEmployer)
          : undefined,
    };
  }

  private coerceArray(value: unknown): Record<string, any>[] {
    if (Array.isArray(value)) return value as Record<string, any>[];
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private coerceObject(value: unknown): Record<string, any> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  async create(
    createApplicationDto: CreateApplicationDto,
    file?: Express.Multer.File,
  ): Promise<Application> {
    try {
      const email = createApplicationDto.email?.trim()?.toLowerCase();
      if (!email) {
        throw new BadRequestException("email is required");
      }

      const phone =
        createApplicationDto.phone_number?.trim() ||
        createApplicationDto.mobile?.trim() ||
        null;

      let resume_url = createApplicationDto.resume_url?.trim() || null;
      let resume_file_key =
        createApplicationDto.resume_file_key?.trim() || null;
      let original_filename =
        createApplicationDto.original_filename?.trim() || null;

      if (file?.buffer?.length) {
        const uploaded = await this.resumeS3.uploadResume(file);
        resume_url = uploaded.url;
        resume_file_key = uploaded.key;
        original_filename = file.originalname || original_filename;
      }

      if (!resume_url) {
        throw new BadRequestException("Resume file is required");
      }

      const jobId =
        createApplicationDto.job_id != null
          ? Number(createApplicationDto.job_id)
          : null;
      if (jobId && Number.isFinite(jobId)) {
        const job = await this.jobRepository.findOne({
          where: { id: jobId, is_archived: false },
        });
        if (!job) {
          throw new BadRequestException(`Job #${jobId} not found`);
        }
      }

      const education = this.normalizeEducation(
        this.coerceArray(createApplicationDto.education as any),
      );
      const experience = this.normalizeExperience(
        this.coerceArray(createApplicationDto.experience as any),
      );
      const disclosure = this.normalizeDisclosure(
        this.coerceObject(createApplicationDto.disclosure as any),
      );

      const application = this.applicationRepository.create({
        first_name: createApplicationDto.first_name?.trim() || null,
        last_name: createApplicationDto.last_name?.trim() || null,
        applicant_name: this.buildApplicantName(createApplicationDto),
        father_name: createApplicationDto.father_name?.trim() || null,
        cnic: createApplicationDto.cnic?.trim() || null,
        disability: createApplicationDto.disability?.trim() || null,
        gender: createApplicationDto.gender?.trim() || null,
        marital_status: createApplicationDto.marital_status?.trim() || null,
        husband_name: createApplicationDto.husband_name?.trim() || null,
        email,
        phone_number: phone,
        office_phone: createApplicationDto.office_phone?.trim() || null,
        residence_phone: createApplicationDto.residence_phone?.trim() || null,
        country: createApplicationDto.country?.trim() || null,
        state: createApplicationDto.state?.trim() || null,
        city: createApplicationDto.city?.trim() || null,
        postal_code: createApplicationDto.postal_code?.trim() || null,
        current_address: createApplicationDto.current_address?.trim() || null,
        permanent_address:
          createApplicationDto.permanent_address?.trim() || null,
        education,
        has_work_experience:
          createApplicationDto.has_work_experience ?? null,
        experience,
        disclosure,
        resume_url,
        resume_file_key,
        original_filename,
        cover_letter: createApplicationDto.cover_letter?.trim() || null,
        status: ApplicationStatus.PENDING,
        job_id: jobId && Number.isFinite(jobId) ? jobId : null,
      });

      return await this.applicationRepository.save(application);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      if (error?.code === "23505") {
        throw new BadRequestException(
          "An application with this email already exists for this job",
        );
      }
      throw new InternalServerErrorException(
        error?.message || "Failed to create application",
      );
    }
  }

  async findAll(filters: ApplicationListFilters = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize =
      filters.pageSize && filters.pageSize > 0
        ? Math.min(filters.pageSize, 100)
        : 10;
    const sortField = filters.sortField || "created_at";
    const sortOrder = filters.sortOrder === "ASC" ? "ASC" : "DESC";
    const allowedSort = new Set([
      "created_at",
      "updated_at",
      "applicant_name",
      "email",
      "status",
      "city",
      "cnic",
    ]);
    const orderField = allowedSort.has(sortField) ? sortField : "created_at";

    try {
      const qb = this.applicationRepository
        .createQueryBuilder("app")
        .leftJoinAndSelect("app.job", "job")
        .leftJoinAndSelect("app.created_by", "created_by")
        .leftJoinAndSelect("app.updated_by", "updated_by")
        .where("app.is_archived = false");

      if (filters.job_id) {
        qb.andWhere("app.job_id = :jobId", { jobId: filters.job_id });
      }
      if (filters.status?.trim()) {
        qb.andWhere("app.status = :status", {
          status: filters.status.trim().toLowerCase(),
        });
      }
      if (filters.gender?.trim()) {
        qb.andWhere("LOWER(app.gender) = LOWER(:gender)", {
          gender: filters.gender.trim(),
        });
      }
      if (filters.city?.trim()) {
        qb.andWhere("app.city ILIKE :city", {
          city: `%${filters.city.trim()}%`,
        });
      }
      if (filters.country?.trim()) {
        qb.andWhere("app.country ILIKE :country", {
          country: `%${filters.country.trim()}%`,
        });
      }
      if (filters.cnic?.trim()) {
        qb.andWhere("REPLACE(app.cnic, '-', '') ILIKE :cnic", {
          cnic: `%${filters.cnic.trim().replace(/-/g, "")}%`,
        });
      }
      if (typeof filters.has_work_experience === "boolean") {
        qb.andWhere("app.has_work_experience = :hwe", {
          hwe: filters.has_work_experience,
        });
      }
      if (filters.from_date) {
        qb.andWhere("app.created_at >= :fromDate", {
          fromDate: new Date(filters.from_date),
        });
      }
      if (filters.to_date) {
        qb.andWhere("app.created_at <= :toDate", {
          toDate: new Date(filters.to_date),
        });
      }
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        qb.andWhere(
          `(app.applicant_name ILIKE :term
            OR app.first_name ILIKE :term
            OR app.last_name ILIKE :term
            OR app.email ILIKE :term
            OR app.phone_number ILIKE :term
            OR app.cnic ILIKE :term
            OR job.title ILIKE :term)`,
          { term },
        );
      }

      qb.orderBy(`app.${orderField}`, sortOrder)
        .skip((page - 1) * pageSize)
        .take(pageSize);

      const [applications, total] = await qb.getManyAndCount();
      const totalPages = Math.ceil(total / pageSize) || 1;

      return {
        success: true,
        data: applications,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
        filters: {
          job_id: filters.job_id || null,
          status: filters.status || null,
          search: filters.search || null,
          gender: filters.gender || null,
          city: filters.city || null,
          country: filters.country || null,
          cnic: filters.cnic || null,
          has_work_experience:
            typeof filters.has_work_experience === "boolean"
              ? filters.has_work_experience
              : null,
          from_date: filters.from_date || null,
          to_date: filters.to_date || null,
        },
      };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  async findOne(id: number) {
    const application = await this.applicationRepository.findOne({
      where: { id, is_archived: false },
      relations: ["job", "created_by", "updated_by"],
    });

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    return {
      success: true,
      data: application,
    };
  }

  async update(id: number, updateApplicationDto: UpdateApplicationDto) {
    const application = await this.applicationRepository.findOne({
      where: { id, is_archived: false },
    });

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    if (updateApplicationDto.email !== undefined) {
      application.email =
        updateApplicationDto.email?.trim()?.toLowerCase() || null;
    }
    if (updateApplicationDto.first_name !== undefined) {
      application.first_name =
        updateApplicationDto.first_name?.trim() || null;
    }
    if (updateApplicationDto.last_name !== undefined) {
      application.last_name = updateApplicationDto.last_name?.trim() || null;
    }
    if (
      updateApplicationDto.first_name !== undefined ||
      updateApplicationDto.last_name !== undefined ||
      updateApplicationDto.applicant_name !== undefined
    ) {
      application.applicant_name =
        this.buildApplicantName({
          ...application,
          ...updateApplicationDto,
        } as any) || application.applicant_name;
    }

    const scalarMap: Array<[keyof UpdateApplicationDto, keyof Application]> = [
      ["father_name", "father_name"],
      ["cnic", "cnic"],
      ["disability", "disability"],
      ["gender", "gender"],
      ["marital_status", "marital_status"],
      ["husband_name", "husband_name"],
      ["office_phone", "office_phone"],
      ["residence_phone", "residence_phone"],
      ["country", "country"],
      ["state", "state"],
      ["city", "city"],
      ["postal_code", "postal_code"],
      ["current_address", "current_address"],
      ["permanent_address", "permanent_address"],
      ["cover_letter", "cover_letter"],
      ["resume_url", "resume_url"],
      ["resume_file_key", "resume_file_key"],
      ["original_filename", "original_filename"],
    ];

    for (const [dtoKey, entityKey] of scalarMap) {
      if (updateApplicationDto[dtoKey] !== undefined) {
        const raw = updateApplicationDto[dtoKey] as any;
        (application as any)[entityKey] =
          typeof raw === "string" ? raw.trim() || null : raw;
      }
    }

    if (
      updateApplicationDto.phone_number !== undefined ||
      updateApplicationDto.mobile !== undefined
    ) {
      application.phone_number =
        updateApplicationDto.phone_number?.trim() ||
        updateApplicationDto.mobile?.trim() ||
        null;
    }
    if (updateApplicationDto.education !== undefined) {
      application.education = this.normalizeEducation(
        updateApplicationDto.education,
      );
    }
    if (updateApplicationDto.experience !== undefined) {
      application.experience = this.normalizeExperience(
        updateApplicationDto.experience,
      );
    }
    if (updateApplicationDto.disclosure !== undefined) {
      application.disclosure = this.normalizeDisclosure(
        updateApplicationDto.disclosure,
      );
    }
    if (updateApplicationDto.has_work_experience !== undefined) {
      application.has_work_experience =
        updateApplicationDto.has_work_experience;
    }
    if (updateApplicationDto.status !== undefined) {
      application.status = updateApplicationDto.status;
    }
    if (updateApplicationDto.job_id !== undefined) {
      application.job_id = updateApplicationDto.job_id || null;
    }

    const updatedApplication =
      await this.applicationRepository.save(application);

    return {
      success: true,
      message: "Application updated successfully",
      data: updatedApplication,
    };
  }

  async remove(id: number) {
    const application = await this.applicationRepository.findOne({
      where: { id, is_archived: false },
    });

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    application.is_archived = true;
    await this.applicationRepository.save(application);

    return {
      success: true,
      message: "Application deleted successfully",
    };
  }
}
