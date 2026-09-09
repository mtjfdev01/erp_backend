import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventPledge } from "./entities/event-pledge.entity";
import { CreateEventPledgeDto } from "./dto/create-event-pledge.dto";
import { UpdateEventPledgeDto } from "./dto/update-event-pledge.dto";

@Injectable()
export class EventPledgesService {
  constructor(
    @InjectRepository(EventPledge)
    private readonly pledgeRepo: Repository<EventPledge>,
  ) {}

  async create(
    dto: CreateEventPledgeDto,
    userId?: number | null,
  ): Promise<EventPledge> {
    const row = this.pledgeRepo.create({
      donor_name: dto.donor_name.trim(),
      contact_number: dto.contact_number?.trim() || null,
      care_of_representative: dto.care_of_representative?.trim() || null,
      donation_type: dto.donation_type,
      donation_amount: String(dto.donation_amount),
      address: dto.address?.trim() || null,
      ...(userId && userId > 0
        ? { created_by: { id: userId } as any, updated_by: { id: userId } as any }
        : {}),
    });
    return this.pledgeRepo.save(row);
  }

  async findAll(query: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: "ASC" | "DESC";
    search?: string;
    donation_type?: string;
  }): Promise<{
    data: EventPledge[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
    const sortField = [
      "id",
      "donor_name",
      "contact_number",
      "donation_type",
      "donation_amount",
      "created_at",
      "updated_at",
    ].includes(String(query.sortField || ""))
      ? String(query.sortField)
      : "created_at";
    const sortOrder =
      String(query.sortOrder || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const qb = this.pledgeRepo
      .createQueryBuilder("p")
      .where("p.is_archived = false");

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        `(p.donor_name ILIKE :term
          OR p.contact_number ILIKE :term
          OR p.care_of_representative ILIKE :term
          OR p.address ILIKE :term)`,
        { term },
      );
    }

    if (query.donation_type && ["general", "zakat"].includes(query.donation_type)) {
      qb.andWhere("p.donation_type = :donationType", {
        donationType: query.donation_type,
      });
    }

    qb.orderBy(`p.${sortField}`, sortOrder)
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(id: number): Promise<EventPledge> {
    const row = await this.pledgeRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) {
      throw new NotFoundException("Event pledge not found");
    }
    return row;
  }

  async update(
    id: number,
    dto: UpdateEventPledgeDto,
    userId?: number | null,
  ): Promise<EventPledge> {
    const row = await this.findOne(id);

    if (dto.donor_name !== undefined) {
      row.donor_name = dto.donor_name.trim();
    }
    if (dto.contact_number !== undefined) {
      row.contact_number = dto.contact_number?.trim() || null;
    }
    if (dto.care_of_representative !== undefined) {
      row.care_of_representative = dto.care_of_representative?.trim() || null;
    }
    if (dto.donation_type !== undefined) {
      row.donation_type = dto.donation_type;
    }
    if (dto.donation_amount !== undefined) {
      row.donation_amount = String(dto.donation_amount);
    }
    if (dto.address !== undefined) {
      row.address = dto.address?.trim() || null;
    }
    if (userId && userId > 0) {
      (row as any).updated_by = { id: userId };
    }

    return this.pledgeRepo.save(row);
  }

  async remove(id: number, userId?: number | null): Promise<void> {
    await this.findOne(id);
    await this.pledgeRepo.update(id, {
      is_archived: true,
      ...(userId && userId > 0
        ? { updated_by: { id: userId } as any }
        : {}),
    });
  }
}
