import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThan, Not } from 'typeorm';
import { Job, JobType, JobStatus, Department } from './entities/job.entity';
import { JobApplication, ApplicationStatus } from './job-applications/entities/job-application.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { CreateJobApplicationDto } from './job-applications/dto/create-job-application.dto';
import { UpdateApplicationStatusDto } from './job-applications/dto/update-application-status.dto';
import { applyCommonFilters, FilterPayload } from 'src/utils/filters/common-filter.util';
import { EmailService } from 'src/email/email.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    @InjectRepository(JobApplication)
    private applicationRepository: Repository<JobApplication>,
    private emailService: EmailService,
  ) {}

  /**
   * Generate URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Ensure unique slug by appending number if needed
   */
  private async ensureUniqueSlug(slug: string, excludeId?: number): Promise<string> {
    let uniqueSlug = slug;
    let counter = 1;

    while (true) {
      const existing = await this.jobRepository.findOne({
        where: {
          slug: uniqueSlug,
          ...(excludeId ? { id: Not(excludeId) } : {}),
        },
      });

      if (!existing) {
        return uniqueSlug;
      }

      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }
  }

  /**
   * Auto-close jobs with past closing dates
   */
  private async autoCloseExpiredJobs(): Promise<void> {
    const now = new Date();
    await this.jobRepository.update(
      {
        status: JobStatus.ACTIVE,
        closing_date: LessThan(now),
      },
      {
        status: JobStatus.CLOSED,
      },
    );
  }

  /**
   * Create a new job posting
   */
  async create(createJobDto: CreateJobDto, user: any): Promise<Job> {
    try {
      // Generate slug if not provided
      let slug = createJobDto.slug;
      if (!slug) {
        slug = this.generateSlug(createJobDto.title);
      }

      // Ensure unique slug
      slug = await this.ensureUniqueSlug(slug);

      // Set posted_date if not provided
      const postedDate = createJobDto.posted_date || new Date();

      // Create job entity
      const job = this.jobRepository.create({
        ...createJobDto,
        slug,
        posted_date: postedDate,
        status: createJobDto.status || JobStatus.ACTIVE,
        is_featured: createJobDto.is_featured || false,
        created_by: user?.id ? { id: user.id } : null,
      });

      const savedJob = await this.jobRepository.save(job);
      return savedJob;
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        throw new ConflictException('A job with this slug already exists');
      }
      throw new BadRequestException(`Failed to create job: ${error.message}`);
    }
  }

  /**
   * Find all jobs with filtering and pagination
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    filters: {
      department?: Department;
      type?: JobType;
      location?: string;
      search?: string;
      status?: JobStatus;
    } = {},
    user?: any,
  ) {
    try {

      // Auto-close expired jobs
      // await this.autoCloseExpiredJobs();

      const skip = (page - 1) * limit;
      const queryBuilder = this.jobRepository.createQueryBuilder('job');

      // Default to active jobs for public access
      const status = filters.status || (user ? undefined : JobStatus.ACTIVE);
      if (status) {
        queryBuilder.andWhere('job.status = :status', { status });
      }

      // Apply filters
      const filterPayload: FilterPayload = {
        ...(filters.department && { department: filters.department }),
        ...(filters.type && { type: filters.type }),
        ...(filters.location && { location: filters.location }),
        ...(filters.search && { search: filters.search }),
      };

      const searchFields = ['title', 'about', 'location'];
      applyCommonFilters(queryBuilder, filterPayload, searchFields, 'job');

      // Search in qualifications and responsibilities (JSON fields)
      if (filters.search) {
        queryBuilder.orWhere(
          "CAST(job.qualifications AS TEXT) ILIKE :search OR CAST(job.responsibilities AS TEXT) ILIKE :search",
          { search: `%${filters.search}%` },
        );
      }

      // Exclude archived jobs
      queryBuilder.andWhere('job.is_archived = :is_archived', { is_archived: false });

      // Order by featured first, then by posted_date (newest first)
      queryBuilder.orderBy('job.is_featured', 'DESC');
      queryBuilder.addOrderBy('job.posted_date', 'DESC');

      // Get total count
      const totalItems = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder.skip(skip).take(limit);

      const jobs = await queryBuilder.getMany();

      const totalPages = Math.ceil(totalItems / limit);

      return {
        jobs,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve jobs: ${error.message}`);
    }
  }

  /**
   * Find a single job by ID or slug
   */
  async findOne(identifier: string | number): Promise<Job> {
    try {
      await this.autoCloseExpiredJobs();

      const where: any = { is_archived: false };

      if (typeof identifier === 'number' || !isNaN(Number(identifier))) {
        where.id = Number(identifier);
      } else {
        where.slug = identifier;
      }

      const job = await this.jobRepository.findOne({
        where,
        relations: ['applications'],
      });

      if (!job) {
        throw new NotFoundException(`Job with identifier ${identifier} not found`);
      }

      return job;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve job: ${error.message}`);
    }
  }

  /**
   * Update a job
   */
  async update(id: number, updateJobDto: UpdateJobDto, user: any): Promise<Job> {
    try {
      const job = await this.jobRepository.findOne({ where: { id, is_archived: false } });

      if (!job) {
        throw new NotFoundException(`Job with ID ${id} not found`);
      }

      // Generate new slug if title changed
      if (updateJobDto.title && updateJobDto.title !== job.title) {
        const newSlug = this.generateSlug(updateJobDto.title);
        updateJobDto.slug = await this.ensureUniqueSlug(newSlug, id);
      }

      // Update job
      await this.jobRepository.update(id, {
        ...updateJobDto,
        updated_by: user?.id ? { id: user.id } : null,
      });

      return await this.jobRepository.findOne({ where: { id } });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update job: ${error.message}`);
    }
  }

  /**
   * Soft delete a job (archive it)
   */
  async remove(id: number, user: any): Promise<void> {
    try {
      const job = await this.jobRepository.findOne({ where: { id, is_archived: false } });

      if (!job) {
        throw new NotFoundException(`Job with ID ${id} not found`);
      }

      // Soft delete by archiving
      await this.jobRepository.update(id, {
        is_archived: true,
        status: JobStatus.CLOSED,
        updated_by: user?.id ? { id: user.id } : null,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete job: ${error.message}`);
    }
  }

  /**
   * Submit a job application
   */
  async createApplication(
    jobId: number,
    createApplicationDto: CreateJobApplicationDto,
    file?: Express.Multer.File,
  ): Promise<JobApplication> {
    try {
      // Check if job exists and is active
      const job = await this.jobRepository.findOne({
        where: { id: jobId, is_archived: false, status: JobStatus.ACTIVE },
      });

      if (!job) {
        throw new NotFoundException('Job not found or not accepting applications');
      }

      // Check if closing date has passed
      if (job.closing_date && new Date(job.closing_date) < new Date()) {
        throw new BadRequestException('This job is no longer accepting applications');
      }

      // Rate limiting: Check applications in last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const recentApplications = await this.applicationRepository.count({
        where: {
          email: createApplicationDto.email,
          application_date: Not(LessThan(oneDayAgo)),
        },
      });

      if (recentApplications >= 5) {
        throw new BadRequestException(
          'You have reached the maximum number of applications per day (5). Please try again tomorrow.',
        );
      }

      // Validate consent
      if (!createApplicationDto.consent) {
        throw new BadRequestException('Consent is required to submit an application');
      }

      // Handle file upload
      let cvResumePath = createApplicationDto.cv_resume;
      if (file) {
        cvResumePath = await this.saveApplicationFile(file, jobId);
      }

      // Create application
      const application = this.applicationRepository.create({
        job_id: jobId,
        full_name: createApplicationDto.full_name,
        email: createApplicationDto.email,
        phone: createApplicationDto.phone,
        cover_letter: createApplicationDto.cover_letter,
        cv_resume: cvResumePath,
        consent: createApplicationDto.consent,
        status: ApplicationStatus.PENDING,
        application_date: new Date(),
      });

      const savedApplication = await this.applicationRepository.save(application);

      // Send confirmation email to applicant
      await this.emailService.sendJobApplicationConfirmation({
        applicantName: createApplicationDto.full_name,
        applicantEmail: createApplicationDto.email,
        jobTitle: job.title,
        applicationId: savedApplication.id,
      });

      // Send notification email to admin
      await this.emailService.sendNewJobApplicationNotification({
        applicantName: createApplicationDto.full_name,
        applicantEmail: createApplicationDto.email,
        jobTitle: job.title,
        applicationId: savedApplication.id,
      });

      return savedApplication;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to submit application: ${error.message}`);
    }
  }

  /**
   * Save uploaded CV/Resume file
   */
  private async saveApplicationFile(file: Express.Multer.File, jobId: number): Promise<string> {
    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExtensions = ['.pdf', '.doc', '.docx'];

    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.includes(file.mimetype) || !allowedExtensions.includes(fileExtension)) {
      throw new BadRequestException('Invalid file type. Only PDF, DOC, and DOCX files are allowed.');
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit.');
    }

    // Create upload directory structure
    const uploadDir = path.join(process.cwd(), 'uploads', 'job-applications', jobId.toString());
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedFilename}`;
    const filePath = path.join(uploadDir, filename);

    // Save file
    fs.writeFileSync(filePath, file.buffer);

    // Return relative path
    return path.join('uploads', 'job-applications', jobId.toString(), filename);
  }

  /**
   * Get all applications with filtering
   */
  async findAllApplications(
    page: number = 1,
    limit: number = 10,
    filters: {
      jobId?: number;
      status?: ApplicationStatus;
      search?: string;
    } = {},
  ) {
    try {
      const skip = (page - 1) * limit;
      const queryBuilder = this.applicationRepository
        .createQueryBuilder('application')
        .leftJoinAndSelect('application.job', 'job')
        .leftJoinAndSelect('application.reviewed_by', 'reviewed_by');

      // Apply filters
      if (filters.jobId) {
        queryBuilder.andWhere('application.job_id = :jobId', { jobId: filters.jobId });
      }

      if (filters.status) {
        queryBuilder.andWhere('application.status = :status', { status: filters.status });
      }

      if (filters.search) {
        queryBuilder.andWhere(
          '(application.full_name ILIKE :search OR application.email ILIKE :search)',
          { search: `%${filters.search}%` },
        );
      }

      // Exclude archived
      queryBuilder.andWhere('application.is_archived = :is_archived', { is_archived: false });

      // Order by application date (newest first)
      queryBuilder.orderBy('application.application_date', 'DESC');

      // Get total count
      const totalItems = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder.skip(skip).take(limit);

      const applications = await queryBuilder.getMany();

      const totalPages = Math.ceil(totalItems / limit);

      return {
        applications,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve applications: ${error.message}`);
    }
  }

  /**
   * Get single application
   */
  async findOneApplication(id: number): Promise<JobApplication> {
    try {
      const application = await this.applicationRepository.findOne({
        where: { id, is_archived: false },
        relations: ['job', 'reviewed_by'],
      });

      if (!application) {
        throw new NotFoundException(`Application with ID ${id} not found`);
      }

      return application;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve application: ${error.message}`);
    }
  }

  /**
   * Update application status
   */
  async updateApplicationStatus(
    id: number,
    updateDto: UpdateApplicationStatusDto,
    user: any,
  ): Promise<JobApplication> {
    try {
      const application = await this.applicationRepository.findOne({
        where: { id, is_archived: false },
        relations: ['job'],
      });

      if (!application) {
        throw new NotFoundException(`Application with ID ${id} not found`);
      }

      // Update application
      await this.applicationRepository.update(id, {
        status: updateDto.status || application.status,
        notes: updateDto.notes || application.notes,
        reviewed_by: user?.id ? { id: user.id } : null,
        reviewed_at: new Date(),
      });

      const updatedApplication = await this.applicationRepository.findOne({
        where: { id },
        relations: ['job', 'reviewed_by'],
      });

      // Send status update email to applicant
      if (updateDto.status && updateDto.status !== application.status) {
        await this.emailService.sendJobApplicationStatusUpdate({
          applicantName: application.full_name,
          applicantEmail: application.email,
          jobTitle: application.job.title,
          oldStatus: application.status,
          newStatus: updateDto.status,
        });
      }

      return updatedApplication;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update application status: ${error.message}`);
    }
  }

  /**
   * Get applications for a specific job
   */
  async findApplicationsByJob(jobId: number, page: number = 1, limit: number = 10) {
    return this.findAllApplications(page, limit, { jobId });
  }
}
