import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateHealthDto } from './dto/create-health.dto';
import { UpdateHealthDto } from './dto/update-health.dto';
import { Repository } from 'typeorm';
import { HealthReport } from './entities/health.entity';
import { User } from '../../users/user.entity';

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthReport)
    private readonly healthReportRepository: Repository<HealthReport>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createDto: CreateHealthDto, user: User) {
    try {
      const dbUser = await this.userRepository.findOne({ where: { id: user.id } });
      const report = this.healthReportRepository.create({
        date: new Date(createDto.date),
        type: createDto.type,
        widows: createDto.widows || 0,
        divorced: createDto.divorced || 0,
        disable: createDto.disable || 0,
        indegent: createDto.indegent || 0,
        orphans: createDto.orphans || 0,
        created_by: dbUser,
        updated_by: dbUser,
      });
      return await this.healthReportRepository.save(report);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async createMultiple(createDtos: CreateHealthDto[]): Promise<HealthReport[]> {
    const reports = createDtos.map((dto) =>
      this.healthReportRepository.create({
        date: new Date(dto.date),
        type: dto.type,
        widows: dto.widows || 0,
        divorced: dto.divorced || 0,
        disable: dto.disable || 0,
        indegent: dto.indegent || 0,
        orphans: dto.orphans || 0,
      }),
    );

    return await this.healthReportRepository.save(reports);
  }

  async findAll(
    page: number = 1,
    pageSize: number = 10,
    sortField: string = 'date',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{ data: any[]; pagination: any }> {
    try {
      const skip = (page - 1) * pageSize;

      const queryBuilder = this.healthReportRepository
        .createQueryBuilder('report')
        .where({ is_archived: false })
        .orderBy(`report.${sortField}`, sortOrder)
        .skip(skip)
        .take(pageSize);

      const reports = await queryBuilder.getMany();
      const total = await this.healthReportRepository.count({ where: { is_archived: false } });
      const totalPages = Math.ceil(total / pageSize);

      const groupedReports = reports.reduce((acc, report) => {
        const dateKey =
          report.date instanceof Date ? report.date.toISOString().split('T')[0] : new Date(report.date).toISOString().split('T')[0];

        if (!acc[dateKey]) {
          acc[dateKey] = {
            id: report.id,
            date: report.date,
            distributions: [],
          };
        }

        acc[dateKey].distributions.push({
          id: report.id,
          type: report.type,
          vulnerabilities: {
            Widows: report.widows,
            Divorced: report.divorced,
            Disable: report.disable,
            Indegent: report.indegent,
            Orphans: report.orphans,
          },
        });

        return acc;
      }, {});

      return {
        data: Object.values(groupedReports),
        pagination: {
          total,
          page,
          pageSize,
          totalPages,
        },
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch health reports: ' + error.message);
    }
  }

  async findOne(id: number): Promise<HealthReport> {
    const report = await this.healthReportRepository.findOne({ where: { id, is_archived: false } });
    if (!report) throw new NotFoundException(`Health report with ID ${id} not found`);
    return report;
  }

  async findByDate(date: string): Promise<HealthReport[]> {
    return await this.healthReportRepository.find({
      where: { date: new Date(date), is_archived: false },
      order: { id: 'ASC' },
    });
  }

  async update(id: number, updateDto: UpdateHealthDto): Promise<HealthReport> {
    const report = await this.healthReportRepository.findOne({ where: { id, is_archived: false } });
    if (!report) throw new NotFoundException(`Health report with ID ${id} not found`);

    if (updateDto.date) report.date = new Date(updateDto.date);
    if (updateDto.type) report.type = updateDto.type;
    if (updateDto.widows !== undefined) report.widows = updateDto.widows;
    if (updateDto.divorced !== undefined) report.divorced = updateDto.divorced;
    if (updateDto.disable !== undefined) report.disable = updateDto.disable;
    if (updateDto.indegent !== undefined) report.indegent = updateDto.indegent;
    if (updateDto.orphans !== undefined) report.orphans = updateDto.orphans;

    return await this.healthReportRepository.save(report);
  }

  async remove(id: number): Promise<void> {
    const report = await this.healthReportRepository.findOne({ where: { id, is_archived: false } });
    if (!report) throw new NotFoundException(`Health report with ID ${id} not found`);
    await this.healthReportRepository.update(id, { is_archived: true });
  }

  async removeByDate(date: string): Promise<void> {
    const reports = await this.findByDate(date);
    if (!reports || reports.length === 0) throw new NotFoundException(`Health reports with date ${date} not found`);
    await this.healthReportRepository.update({ date: new Date(date) }, { is_archived: true });
  }
}
