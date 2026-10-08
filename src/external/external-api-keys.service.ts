import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomBytes } from "crypto";
import { ExternalApiKey } from "./entities/external-api-key.entity";

@Injectable()
export class ExternalApiKeysService {
  constructor(
    @InjectRepository(ExternalApiKey)
    private readonly repo: Repository<ExternalApiKey>,
  ) {}

  /** Generate a unique opaque key: mtjf_ext_<32 hex bytes> */
  private generateKey(): string {
    return `mtjf_ext_${randomBytes(24).toString("hex")}`;
  }

  private toPublic(row: ExternalApiKey, includeFullKey = false) {
    return {
      id: row.id,
      partner_name: row.partner_name,
      key_prefix: row.key_prefix,
      ...(includeFullKey ? { api_key: row.api_key } : {}),
      donation_source: row.donation_source,
      is_active: row.is_active,
      notes: row.notes,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async findActiveByKey(apiKey: string): Promise<ExternalApiKey | null> {
    const key = String(apiKey || "").trim();
    if (!key) return null;

    return this.repo
      .createQueryBuilder("k")
      .where("k.api_key = :key", { key })
      .andWhere("k.is_active = true")
      .andWhere("k.is_archived = false")
      .getOne();
  }

  async touchLastUsed(id: number): Promise<void> {
    await this.repo.update(id, { last_used_at: new Date() });
  }

  async list(): Promise<ReturnType<ExternalApiKeysService["toPublic"]>[]> {
    const rows = await this.repo.find({
      where: { is_archived: false },
      order: { id: "DESC" },
    });
    return rows.map((r) => this.toPublic(r, false));
  }

  async create(input: {
    partner_name: string;
    donation_source?: string | null;
    notes?: string | null;
    api_key?: string | null;
  }) {
    const partnerName = String(input.partner_name || "").trim();
    if (!partnerName) {
      throw new BadRequestException("partner_name is required");
    }

    let apiKey = String(input.api_key || "").trim();
    if (!apiKey) {
      apiKey = this.generateKey();
    }
    if (apiKey.length < 16) {
      throw new BadRequestException("api_key must be at least 16 characters");
    }

    const existing = await this.repo.findOne({ where: { api_key: apiKey } });
    if (existing) {
      throw new BadRequestException("api_key already exists");
    }

    const row = this.repo.create({
      partner_name: partnerName,
      api_key: apiKey,
      key_prefix: apiKey.slice(0, 12),
      donation_source: input.donation_source?.trim() || partnerName,
      notes: input.notes?.trim() || null,
      is_active: true,
      is_archived: false,
    });
    const saved = await this.repo.save(row);
    // Full key returned only on create
    return this.toPublic(saved, true);
  }

  async update(
    id: number,
    patch: {
      partner_name?: string;
      donation_source?: string | null;
      notes?: string | null;
      is_active?: boolean;
    },
  ) {
    const row = await this.repo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) throw new NotFoundException("API key not found");

    if (patch.partner_name != null) {
      const name = String(patch.partner_name).trim();
      if (!name) throw new BadRequestException("partner_name cannot be empty");
      row.partner_name = name;
    }
    if (patch.donation_source !== undefined) {
      row.donation_source = patch.donation_source?.trim() || null;
    }
    if (patch.notes !== undefined) {
      row.notes = patch.notes?.trim() || null;
    }
    if (patch.is_active !== undefined) {
      row.is_active = !!patch.is_active;
    }

    const saved = await this.repo.save(row);
    return this.toPublic(saved, false);
  }

  async revoke(id: number) {
    const row = await this.repo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) throw new NotFoundException("API key not found");
    row.is_active = false;
    row.is_archived = true;
    await this.repo.save(row);
    return { id, revoked: true };
  }
}
