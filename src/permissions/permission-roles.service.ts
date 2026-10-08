import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PermissionRole } from "./entities/permission-role.entity";
import { CreatePermissionRoleDto } from "./dto/create-permission-role.dto";
import { UpdatePermissionRoleDto } from "./dto/update-permission-role.dto";
import {
  LOOKUP_PROFILES,
  listEntityLookup,
  type EntityLookupParams,
  type LookupOption,
} from "../utils/lookup";

@Injectable()
export class PermissionRolesService {
  constructor(
    @InjectRepository(PermissionRole)
    private readonly permissionRoleRepo: Repository<PermissionRole>,
  ) {}

  private clonePermissions(
    permissions?: Record<string, any> | null,
  ): Record<string, any> {
    if (!permissions || typeof permissions !== "object") return {};
    return JSON.parse(JSON.stringify(permissions));
  }

  async findAll(opts?: { activeOnly?: boolean }): Promise<PermissionRole[]> {
    const qb = this.permissionRoleRepo
      .createQueryBuilder("pr")
      .where("pr.is_archived = :archived", { archived: false })
      .orderBy("pr.name", "ASC");
    if (opts?.activeOnly) {
      qb.andWhere("pr.is_active = :active", { active: true });
    }
    return qb.getMany();
  }

  async findOne(id: number): Promise<PermissionRole> {
    const row = await this.permissionRoleRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) {
      throw new NotFoundException(`Permission role ${id} not found`);
    }
    return row;
  }

  async create(
    dto: CreatePermissionRoleDto,
    userId?: number | null,
  ): Promise<PermissionRole> {
    const name = String(dto.name || "").trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    const existing = await this.permissionRoleRepo.findOne({
      where: { name, is_archived: false },
    });
    if (existing) {
      throw new ConflictException(`Permission role "${name}" already exists`);
    }
    const row = this.permissionRoleRepo.create({
      name,
      description: dto.description?.trim() || null,
      permissions: this.clonePermissions(dto.permissions),
      is_active: dto.is_active !== false,
      ...(userId && userId > 0
        ? { created_by: { id: userId } as any, updated_by: { id: userId } as any }
        : {}),
    });
    return this.permissionRoleRepo.save(row);
  }

  async update(
    id: number,
    dto: UpdatePermissionRoleDto,
    userId?: number | null,
  ): Promise<PermissionRole> {
    const row = await this.findOne(id);
    if (dto.name !== undefined) {
      const name = String(dto.name || "").trim();
      if (!name) throw new BadRequestException("name is required");
      const clash = await this.permissionRoleRepo.findOne({
        where: { name, is_archived: false },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(`Permission role "${name}" already exists`);
      }
      row.name = name;
    }
    if (dto.description !== undefined) {
      row.description =
        dto.description == null || String(dto.description).trim() === ""
          ? null
          : String(dto.description).trim();
    }
    if (dto.permissions !== undefined) {
      row.permissions = this.clonePermissions(dto.permissions);
    }
    if (dto.is_active !== undefined) {
      row.is_active = !!dto.is_active;
    }
    if (userId && userId > 0) {
      row.updated_by = { id: userId } as any;
    }
    return this.permissionRoleRepo.save(row);
  }

  async remove(id: number, userId?: number | null): Promise<void> {
    const row = await this.findOne(id);
    row.is_archived = true;
    row.is_active = false;
    if (userId && userId > 0) {
      row.updated_by = { id: userId } as any;
    }
    await this.permissionRoleRepo.save(row);
  }

  /** Deep-cloned permissions JSON for seeding a user. */
  async getPermissionsClone(id: number): Promise<Record<string, any>> {
    const row = await this.findOne(id);
    if (!row.is_active) {
      throw new BadRequestException(`Permission role "${row.name}" is inactive`);
    }
    return this.clonePermissions(row.permissions);
  }

  async listForLookup(params?: EntityLookupParams): Promise<LookupOption[]> {
    return listEntityLookup(
      this.permissionRoleRepo,
      {
        profile: LOOKUP_PROFILES.permission_roles,
        searchFields: ["name"],
        activeColumn: "is_active",
        labelFallback: (row) => `#${row.id}`,
      },
      params,
    );
  }
}
