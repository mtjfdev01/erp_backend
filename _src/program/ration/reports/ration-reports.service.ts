import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RationReport } from './entities/ration-report.entity';
import { CreateRationReportDto } from './dto/create-ration-report.dto';
import { UpdateRationReportDto } from './dto/update-ration-report.dto';
import { User } from '../../../users/user.entity';

@Injectable()
export class RationReportsService {
  constructor(
    @InjectRepository(RationReport)
    private rationReportRepository: Repository<RationReport>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createRationReportDto: CreateRationReportDto, user: User): Promise<any> {
    try {
      const dbUser = await this.userRepository.findOne({ where: { id: user.id } });
      const rationReport = this.rationReportRepository.create({
        ...createRationReportDto,
        created_by: dbUser,
        updated_by: dbUser,
      });
      const savedReport = await this.rationReportRepository.save(rationReport);
      
      return {
        id: savedReport.id,
        report_date: savedReport.report_date,
        is_alternate: savedReport.is_alternate,
        full: {
          Widows: savedReport.full_widows,
          Divorced: savedReport.full_divorced,
          Disable: savedReport.full_disable,
          Indegent: savedReport.full_indegent,
          Orphan: savedReport.full_orphan
        },
        half: {
          Widows: savedReport.half_widows,
          Divorced: savedReport.half_divorced,
          Disable: savedReport.half_disable,
          Indegent: savedReport.half_indegent,
          Orphan: savedReport.half_orphan
        },
        life_time: savedReport.life_time
      };
    } catch (error) {
      throw new BadRequestException('Failed to create ration report: ' + error.message);
    }
  }

  async findAll(page: number = 1, pageSize: number = 10, sortField: string = 'created_at', sortOrder: 'ASC' | 'DESC' = 'DESC'): Promise<{ data: any[]; pagination: any }> {
    try {
      const skip = (page - 1) * pageSize;
      
      const queryBuilder = this.rationReportRepository
        .createQueryBuilder('report')
        .where({ is_archived: false })                  
        .orderBy(`report.${sortField}`, sortOrder)
        .skip(skip)
        .take(pageSize);

      const reports = await queryBuilder.getMany();
      const total = await this.rationReportRepository.count({ where: { is_archived: false } });
      const totalPages = Math.ceil(total / pageSize);

      const formattedReports = reports.map(report => ({
        id: report.id,
        date: report.report_date,
        is_alternate: report.is_alternate,
        full: {
          Widows: report.full_widows,
          Divorced: report.full_divorced,
          Disable: report.full_disable,
          Indegent: report.full_indegent,
          Orphan: report.full_orphan
        },
        half: {
          Widows: report.half_widows,
          Divorced: report.half_divorced,
          Disable: report.half_disable,
          Indegent: report.half_indegent,
          Orphan: report.half_orphan
        },
        life_time: report.life_time
      }));

      return {
        data: formattedReports,
        pagination: {
          total,
          page,
          pageSize,
          totalPages,
        },
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch ration reports: ' + error.message);
    }
  }

  async findOne(id: number): Promise<any> {
    try {
      const report = await this.rationReportRepository.findOne({
        where: { id, is_archived: false },
      });

      if (!report) {
        throw new NotFoundException(`Ration report with ID ${id} not found`);
      }

      return {
        id: report.id,
        date: report.report_date,
        is_alternate: report.is_alternate,
        full: {
          Widows: report.full_widows,
          Divorced: report.full_divorced,
          Disable: report.full_disable,
          Indegent: report.full_indegent,
          Orphan: report.full_orphan
        },
        half: {
          Widows: report.half_widows,
          Divorced: report.half_divorced,
          Disable: report.half_disable,
          Indegent: report.half_indegent,
          Orphan: report.half_orphan
        },
        life_time: report.life_time
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch ration report: ' + error.message);
    }
  }

  async update(id: number, updateRationReportDto: UpdateRationReportDto): Promise<any> {
    try {
      const report = await this.findOne(id);
      
      await this.rationReportRepository.update(id, updateRationReportDto);
      
      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update ration report: ' + error.message);
    }
  }

  async remove(id: number): Promise<void> {
    try {
      const report = await this.rationReportRepository.findOne({ where: { id, is_archived: false } });
      if(!report){
        throw new NotFoundException(`Ration report with ID ${id} not found`);
      }
      await this.rationReportRepository.update(id, { is_archived: true });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to delete ration report: ' + error.message);
    }
  }
} 