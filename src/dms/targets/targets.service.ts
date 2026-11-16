import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../users/user.entity";
import { CreateUserTargetDto } from "./dto/create-user-target.dto";
import { UpdateUserTargetDto } from "./dto/update-user-target.dto";
import {
  UserTarget,
  UserTargetType,
} from "./entities/user-target.entity";

export interface TargetsListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  user_id?: number;
  target_type?: string;
  period_year?: number;
  period_month?: number;
}

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(UserTarget)
    private readonly targetRepo: Repository<UserTarget>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private formatAmount(n: number | string): string {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0.00";
    return num.toFixed(2);
  }

  private async assertUser(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId, is_archived: false } as any,
    });
    if (!user) {
      throw new BadRequestException(`User #${userId} not found`);
    }
    return user;
  }

  async create(dto: CreateUserTargetDto, actorId?: number) {
    await this.assertUser(dto.user_id);

    if (!Object.values(UserTargetType).includes(dto.target_type)) {
      throw new BadRequestException("Invalid target_type");
    }

    const existing = await this.targetRepo.findOne({
      where: {
        user_id: dto.user_id,
        target_type: dto.target_type,
        period_year: dto.period_year,
        period_month: dto.period_month,
        is_archived: false,
      },
    });
    if (existing) {
      throw new ConflictException(
        "A target already exists for this user, type, and month",
      );
    }

    const row = this.targetRepo.create({
      user_id: dto.user_id,
      target_type: dto.target_type,
      target_amount: this.formatAmount(dto.target_amount),
      period_year: dto.period_year,
      period_month: dto.period_month,
      notes: dto.notes?.trim() || null,
      ...(actorId ? { created_by: { id: actorId } as any } : {}),
    });

    const saved = await this.targetRepo.save(row);
    return this.findOne(saved.id);
  }

  async findAll(query: TargetsListQuery = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const qb = this.targetRepo
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.user", "user")
      .where("t.is_archived = false");

    if (query.user_id) {
      qb.andWhere("t.user_id = :userId", { userId: query.user_id });
    }
    if (query.target_type) {
      qb.andWhere("t.target_type = :targetType", {
        targetType: query.target_type,
      });
    }
    if (query.period_year) {
      qb.andWhere("t.period_year = :year", { year: query.period_year });
    }
    if (query.period_month) {
      qb.andWhere("t.period_month = :month", { month: query.period_month });
    }
    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(
          LOWER(COALESCE(user.first_name, '')) LIKE :q
          OR LOWER(COALESCE(user.last_name, '')) LIKE :q
          OR LOWER(COALESCE(user.email, '')) LIKE :q
          OR LOWER(COALESCE(t.notes, '')) LIKE :q
        )`,
        { q },
      );
    }

    qb.orderBy("t.period_year", "DESC")
      .addOrderBy("t.period_month", "DESC")
      .addOrderBy("t.id", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(id: number) {
    const row = await this.targetRepo.findOne({
      where: { id, is_archived: false },
      relations: ["user"],
    });
    if (!row) throw new NotFoundException(`Target #${id} not found`);
    return row;
  }

  /**
   * Lookup helper for dashboards — returns targets for a period (and optional type).
   */
  async listForPeriod(params: {
    period_year: number;
    period_month: number;
    target_type?: UserTargetType | string;
  }) {
    const qb = this.targetRepo
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.user", "user")
      .where("t.is_archived = false")
      .andWhere("t.period_year = :year", { year: params.period_year })
      .andWhere("t.period_month = :month", { month: params.period_month });

    if (params.target_type) {
      qb.andWhere("t.target_type = :type", { type: params.target_type });
    }

    return qb.orderBy("t.target_amount", "DESC").getMany();
  }

  async update(id: number, dto: UpdateUserTargetDto, actorId?: number) {
    const row = await this.findOne(id);

    if (dto.user_id != null) {
      await this.assertUser(dto.user_id);
      row.user_id = dto.user_id;
    }
    if (dto.target_type != null) {
      if (!Object.values(UserTargetType).includes(dto.target_type)) {
        throw new BadRequestException("Invalid target_type");
      }
      row.target_type = dto.target_type;
    }
    if (dto.target_amount != null) {
      row.target_amount = this.formatAmount(dto.target_amount);
    }
    if (dto.period_year != null) row.period_year = dto.period_year;
    if (dto.period_month != null) row.period_month = dto.period_month;
    if (dto.notes !== undefined) row.notes = dto.notes?.trim() || null;

    const clash = await this.targetRepo.findOne({
      where: {
        user_id: row.user_id,
        target_type: row.target_type,
        period_year: row.period_year,
        period_month: row.period_month,
        is_archived: false,
      },
    });
    if (clash && clash.id !== row.id) {
      throw new ConflictException(
        "A target already exists for this user, type, and month",
      );
    }

    if (actorId) {
      row.updated_by = { id: actorId } as any;
    }

    await this.targetRepo.save(row);
    return this.findOne(id);
  }

  async remove(id: number, actorId?: number) {
    const row = await this.findOne(id);
    row.is_archived = true;
    if (actorId) row.updated_by = { id: actorId } as any;
    await this.targetRepo.save(row);
    return { id, archived: true };
  }
}
