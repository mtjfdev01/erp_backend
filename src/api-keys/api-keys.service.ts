import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "crypto";
import { Repository } from "typeorm";
import { ApiKey } from "./entities/api-key.entity";

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly repo: Repository<ApiKey>,
  ) {}

  /** Opaque key: mtjf_ak_<48 hex chars> */
  private generateKey(): string {
    return `mtjf_ak_${randomBytes(24).toString("hex")}`;
  }

  private normalizeScopes(scopes?: string[] | null): string[] {
    if (!Array.isArray(scopes)) return [];
    return [
      ...new Set(
        scopes
          .map((s) => String(s || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  private toPublic(row: ApiKey, includeFullKey = false) {
    return {
      id: row.id,
      name: row.name,
      key_prefix: row.key_prefix,
      ...(includeFullKey ? { api_key: row.api_key } : {}),
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      is_active: row.is_active,
      notes: row.notes,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async findActiveByKey(apiKey: string): Promise<ApiKey | null> {
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

  async list() {
    const rows = await this.repo.find({
      where: { is_archived: false },
      order: { id: "DESC" },
    });
    return rows.map((r) => this.toPublic(r, false));
  }

  async create(input: {
    name: string;
    scopes?: string[] | null;
    notes?: string | null;
    api_key?: string | null;
  }) {
    const name = String(input.name || "").trim();
    if (!name) throw new BadRequestException("name is required");

    let apiKey = String(input.api_key || "").trim();
    if (!apiKey) apiKey = this.generateKey();
    if (apiKey.length < 16) {
      throw new BadRequestException("api_key must be at least 16 characters");
    }

    const existing = await this.repo.findOne({ where: { api_key: apiKey } });
    if (existing) throw new BadRequestException("api_key already exists");

    const scopes = this.normalizeScopes(input.scopes);
    const row = this.repo.create({
      name,
      api_key: apiKey,
      key_prefix: apiKey.slice(0, 14),
      scopes,
      notes: input.notes?.trim() || null,
      is_active: true,
      is_archived: false,
    });
    const saved = await this.repo.save(row);
    return this.toPublic(saved, true);
  }

  async update(
    id: number,
    patch: {
      name?: string;
      scopes?: string[] | null;
      notes?: string | null;
      is_active?: boolean;
    },
  ) {
    const row = await this.repo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) throw new NotFoundException("API key not found");

    if (patch.name != null) {
      const name = String(patch.name).trim();
      if (!name) throw new BadRequestException("name cannot be empty");
      row.name = name;
    }
    if (patch.scopes !== undefined) {
      row.scopes = this.normalizeScopes(patch.scopes);
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
