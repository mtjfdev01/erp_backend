import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThan, Not } from 'typeorm';
import { Job, JobType, JobStatus, Department } from './entities/job.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

import { applyCommonFilters, FilterPayload } from 'src/utils/filters/common-filter.util';
import { EmailService } from 'src/email/email.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
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

}
