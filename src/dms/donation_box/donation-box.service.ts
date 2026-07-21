import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, ILike, SelectQueryBuilder } from "typeorm";
import { DonationBox } from "./entities/donation-box.entity";
import { CreateDonationBoxDto } from "./dto/create-donation-box.dto";
import { UpdateDonationBoxDto } from "./dto/update-donation-box.dto";
import {
  applyCommonFilters,
  FilterPayload,
} from "../../utils/filters/common-filter.util";
import { Route } from "../geographic/routes/entities/route.entity";
import { City } from "../geographic/cities/entities/city.entity";
import { User } from "../../users/user.entity";
import { DonationBoxAuditService } from "./audit/donation-box-audit.service";
import { DonationBoxAuditAction } from "./audit/donation-box-audit-action.enum";
import { DonationBoxAuditSource } from "./audit/donation-box-audit-source.enum";
import { buildDonationBoxFieldChanges } from "./audit/donation-box-audit.util";
import { DataScopeService } from "../../permissions/data-scope/data-scope.service";
import { ResolvedDataScope } from "../../permissions/data-scope/data-scope.types";
import { GeographicScopeService } from "../../permissions/geographic-scope/geographic-scope.service";
import { ResolvedGeographicScope } from "../../permissions/geographic-scope/geographic-scope.types";
import { DonationBoxGeoRecord } from "../../permissions/geographic-scope/geographic-scope.types";
import { buildDonationBoxGeoSearch } from "./utils/donation-box-geo.util";

interface PaginationOptions {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: "ASC" | "DESC";
  search?: string;
  region?: string;
  city?: string;
  box_type?: string;
  status?: string;
  frequency?: string;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class DonationBoxService {
  constructor(
    @InjectRepository(DonationBox)
    private readonly donationBoxRepository: Repository<DonationBox>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly donationBoxAuditService: DonationBoxAuditService,
    private readonly dataScopeService: DataScopeService,
    private readonly geographicScopeService: GeographicScopeService,
  ) {}

  async resolveDonationBoxScope(currentUser?: {
    id?: number;
    role?: string;
    department?: string;
  }): Promise<ResolvedDataScope> {
    return this.dataScopeService.resolveScope(
      currentUser?.id,
      currentUser?.role,
      currentUser?.department,
      "fund_raising",
      "donation_box",
    );
  }

  assertDonationBoxRecordAccess(
    scope: ResolvedDataScope,
    record: DonationBox,
  ): void {
    this.dataScopeService.assertRecordAccess(scope, record);
  }

  private toDonationBoxGeoRecord(box: DonationBox): DonationBoxGeoRecord {
    return {
      city_id: box.city_id,
      route_id: box.route_id,
      landmark_marketplace: box.landmark_marketplace,
      geo_search: box.geo_search,
      created_by: box.created_by,
    };
  }

  /**
   * When geographic territory filter is active, geo match governs access.
   * Otherwise fall back to data scope (created_by).
   */
  assertDonationBoxViewAccess(
    dataScope: ResolvedDataScope,
    box: DonationBox,
    geoScope?: ResolvedGeographicScope | null,
  ): void {
    if (
      geoScope &&
      this.geographicScopeService.isGeographicFilterActive(geoScope)
    ) {
      if (
        !this.geographicScopeService.recordMatches(
          geoScope,
          "donation_boxes",
          this.toDonationBoxGeoRecord(box),
        )
      ) {
        throw new ForbiddenException(
          "You do not have geographic access to this record",
        );
      }
      return;
    }

    this.assertDonationBoxRecordAccess(dataScope, box);
  }

  private applyDonationBoxListDataScope(
    query: SelectQueryBuilder<DonationBox>,
    dataScope: ResolvedDataScope | null,
    geoScope?: ResolvedGeographicScope | null,
  ): void {
    if (!dataScope) return;
    if (
      geoScope &&
      this.geographicScopeService.isGeographicFilterActive(geoScope)
    ) {
      return;
    }
    this.dataScopeService.applyToQuery(query, "donation_box", dataScope);
  }

  private async resolveCityName(cityId?: number | null): Promise<string | null> {
    if (!cityId) return null;
    const city = await this.cityRepository.findOne({
      where: { id: cityId },
      select: ["id", "name"],
    });
    return city?.name ?? null;
  }

  private async refreshDonationBoxGeoSearch(boxId: number): Promise<void> {
    const box = await this.donationBoxRepository.findOne({
      where: { id: boxId },
      relations: ["route", "route.region", "route.country"],
    });
    if (!box) return;

    const cityName = await this.resolveCityName(box.city_id);
    const geo_search = buildDonationBoxGeoSearch({
      landmark_marketplace: box.landmark_marketplace,
      shop_name: box.shop_name,
      route: box.route,
      city_name: cityName,
    });

    await this.donationBoxRepository.update(boxId, { geo_search });
  }

  private donationBoxAuditUserId(
    userId: number | null | undefined,
  ): number | null {
    if (userId == null || Number(userId) === -1) return null;
    return Number(userId);
  }

  private donationBoxAuditSnapshot(box: DonationBox): Record<string, unknown> {
    return {
      key_no: box.key_no,
      route_id: box.route_id,
      city_id: box.city_id,
      shop_name: box.shop_name,
      shopkeeper: box.shopkeeper,
      cell_no: box.cell_no,
      landmark_marketplace: box.landmark_marketplace,
      box_type: box.box_type,
      status: box.status,
      frequency: box.frequency,
      active_since: box.active_since,
      last_collection_date: box.last_collection_date,
      total_collected: box.total_collected,
      collection_count: box.collection_count,
      notes: box.notes,
      is_active: box.is_active,
      is_archived: box.is_archived,
      assigned_user_ids: (box.assignedUsers || [])
        .map((u) => u.id)
        .sort((a, b) => a - b),
    };
  }

  private buildDonationBoxPatch(dto: Record<string, unknown>): Record<string, unknown> {
    const allowed = [
      "key_no",
      "route_id",
      "city_id",
      "shop_name",
      "shopkeeper",
      "cell_no",
      "landmark_marketplace",
      "box_type",
      "status",
      "frequency",
      "active_since",
      "last_collection_date",
      "notes",
      "is_active",
      "is_archived",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }
    return patch;
  }

  async getDonationBoxAuditHistory(donationBoxId: number) {
    return this.donationBoxAuditService.findByDonationBoxId(donationBoxId);
  }

  /**
   * Create a new donation box
   */
  async create(
    createDonationBoxDto: CreateDonationBoxDto,
    currentUser: any,
  ): Promise<DonationBox> {
    try {
      // Validate that route exists
      const route = await this.routeRepository.findOne({
        where: { id: createDonationBoxDto.route_id },
        relations: ["region", "country"],
      });

      if (!route) {
        throw new NotFoundException(
          `Route with ID ${createDonationBoxDto.route_id} not found`,
        );
      }

      // Validate assigned users if provided
      let assignedUsers: User[] = [];
      if (
        createDonationBoxDto.assigned_user_ids &&
        createDonationBoxDto.assigned_user_ids.length > 0
      ) {
        assignedUsers = await this.userRepository.findBy({
          id: In(createDonationBoxDto.assigned_user_ids),
        });

        if (
          assignedUsers.length !== createDonationBoxDto.assigned_user_ids.length
        ) {
          const foundIds = assignedUsers.map((user) => user.id);
          const missingIds = createDonationBoxDto.assigned_user_ids.filter(
            (id) => !foundIds.includes(id),
          );
          throw new NotFoundException(
            `Users with IDs ${missingIds.join(", ")} not found`,
          );
        }
      }

      // Create donation box entity
      const { assigned_user_ids, ...boxData } = createDonationBoxDto;
      const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
      const donationBox = this.donationBoxRepository.create({
        ...boxData,
        ...(auditUserId != null
          ? { created_by: { id: auditUserId } as any }
          : {}),
        assignedUsers: assignedUsers,
        geo_search: buildDonationBoxGeoSearch({
          landmark_marketplace: boxData.landmark_marketplace,
          shop_name: boxData.shop_name,
          route,
          city_name: await this.resolveCityName(boxData.city_id),
        }),
      });

      // Save and return
      const savedBox = await this.donationBoxRepository.save(donationBox);

      return savedBox;
    } catch (error) {
      console.error("Error creating donation box:", error);
      throw new Error(`Failed to create donation box: ${error.message}`);
    }
  }

  /**
   * Resolve route for CSV import — by route_id or route_name (+ optional city).
   */
  async resolveRouteForImport(params: {
    route_id?: number;
    route_name?: string;
    city_id?: number;
    city_name?: string;
  }): Promise<{ route_id: number; city_id?: number }> {
    if (params.route_id) {
      const route = await this.routeRepository.findOne({
        where: { id: params.route_id },
      });
      if (!route) {
        throw new NotFoundException(
          `Route with ID ${params.route_id} not found`,
        );
      }
      return { route_id: route.id, city_id: params.city_id };
    }

    const routeName = params.route_name?.trim();
    if (!routeName) {
      throw new NotFoundException("route_id or route_name is required");
    }

    let cityId = params.city_id;
    if (!cityId && params.city_name?.trim()) {
      const cities = await this.cityRepository.find({
        where: { name: ILike(params.city_name.trim()) },
      });
      if (cities.length === 0) {
        throw new NotFoundException(`City "${params.city_name}" not found`);
      }
      if (cities.length > 1) {
        throw new NotFoundException(
          `Multiple cities match "${params.city_name}" — use city_id`,
        );
      }
      cityId = cities[0].id;
    }

    const qb = this.routeRepository
      .createQueryBuilder("route")
      .where("LOWER(route.name) = LOWER(:name)", { name: routeName });

    if (cityId) {
      qb.innerJoin("route.cities", "city").andWhere("city.id = :cityId", {
        cityId,
      });
    }

    const routes = await qb.getMany();
    if (routes.length === 0) {
      throw new NotFoundException(
        `Route "${routeName}" not found${cityId ? ` for city_id ${cityId}` : ""}`,
      );
    }
    if (routes.length > 1) {
      throw new NotFoundException(
        `Multiple routes named "${routeName}" — provide city_id or city_name`,
      );
    }

    return { route_id: routes[0].id, city_id: cityId };
  }

  /**
   * CSV / data-import row — same persistence rules as create().
   */
  async importDonationBoxRow(
    row: Record<string, unknown>,
    user: any,
  ): Promise<DonationBox> {
    const resolved = await this.resolveRouteForImport({
      route_id: row.route_id as number | undefined,
      route_name: row.route_name as string | undefined,
      city_id: row.city_id as number | undefined,
      city_name: row.city_name as string | undefined,
    });

    const createDto = {
      key_no: row.key_no as string | undefined,
      route_id: resolved.route_id,
      city_id: resolved.city_id ?? (row.city_id as number | undefined),
      shop_name: String(row.shop_name || "").trim(),
      shopkeeper: row.shopkeeper as string | undefined,
      cell_no: row.cell_no as string | undefined,
      landmark_marketplace: row.landmark_marketplace as string | undefined,
      box_type: row.box_type,
      status: row.status,
      frequency: row.frequency,
      active_since: row.active_since,
      notes: row.notes as string | undefined,
      assigned_user_ids: (row.assigned_user_ids as number[]) || [],
    } as CreateDonationBoxDto;

    return this.create(createDto, user);
  }

  /**
   * Find all donation boxes with pagination and filtering
   */
  async findAll(
    options: PaginationOptions,
    geoScope?: ResolvedGeographicScope | null,
    currentUser?: { id?: number; role?: string; department?: string },
  ) {
    try {
      const {
        page = 1,
        pageSize = 10,
        sortField = "created_at",
        sortOrder = "DESC",
        search = "",
        region = "",
        city = "",
        box_type = "",
        status = "",
        frequency = "",
        is_active,
        start_date,
        end_date,
      } = options;

      const skip = (page - 1) * pageSize;

      // Define searchable fields (only string fields that can be used with LOWER())
      const searchFields = [
        "key_no",
        "shop_name",
        "shopkeeper",
        "cell_no",
        "landmark_marketplace",
        "route.name", // Search in route name from joined table
      ];

      // Build query with filters and relations
      const query = this.donationBoxRepository
        .createQueryBuilder("donation_box")
        .leftJoinAndSelect("donation_box.route", "route")
        .leftJoinAndSelect("route.cities", "cities")
        .leftJoinAndSelect("route.region", "region")
        .leftJoinAndSelect("route.country", "country")
        .leftJoinAndSelect("donation_box.assignedUsers", "assignedUsers");

      // Apply common filters
      const filters: FilterPayload = {
        search,
        region,
        city,
        box_type,
        status,
        frequency,
        start_date,
        end_date,
      };

      if (is_active !== undefined) {
        filters.is_active = is_active;
      }

      applyCommonFilters(query, filters, searchFields, "donation_box");

      if (geoScope) {
        this.geographicScopeService.applyToQuery(
          query,
          "donation_boxes",
          "donation_box",
          geoScope,
        );
      }

      if (currentUser?.id) {
        const scope = await this.resolveDonationBoxScope(currentUser);
        this.applyDonationBoxListDataScope(query, scope, geoScope);
      }

      // Apply sorting
      query.orderBy(`donation_box.${sortField}`, sortOrder);

      // Apply pagination
      query.skip(skip).take(pageSize);

      // Execute query
      const [data, total] = await query.getManyAndCount();
      const totalPages = Math.ceil(total / pageSize);

      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error retrieving donation boxes:", error);
      throw new Error(`Failed to retrieve donation boxes: ${error.message}`);
    }
  }

  /**
   * Find one donation box by ID
   */
  async findOne(id: number): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({
        where: { id },
        relations: [
          "route",
          "route.cities",
          "route.region",
          "route.country",
          "assignedUsers",
          "created_by",
          "updated_by",
        ],
      });

      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      return donationBox;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error("Error retrieving donation box:", error.message);
      throw new NotFoundException(
        `Failed to retrieve donation box: ${error.message}`,
      );
    }
  }

  /**
   * Update a donation box
   */
  async update(
    id: number,
    updateDonationBoxDto: any,
    currentUser?: any,
  ): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({
        where: { id },
        relations: ["assignedUsers"],
      });

      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
      const before = this.donationBoxAuditSnapshot(donationBox);
      const dto = { ...updateDonationBoxDto } as Record<string, unknown>;
      const auditPatch: Record<string, unknown> = {
        ...this.buildDonationBoxPatch(dto),
      };

      if (updateDonationBoxDto.route_id) {
        const route = await this.routeRepository.findOne({
          where: { id: updateDonationBoxDto.route_id },
        });
        if (!route) {
          throw new NotFoundException(
            `Route with ID ${updateDonationBoxDto.route_id} not found`,
          );
        }
      }

      if (updateDonationBoxDto.assigned_user_ids !== undefined) {
        let assignedUsers: User[] = [];
        if (
          updateDonationBoxDto.assigned_user_ids &&
          updateDonationBoxDto.assigned_user_ids.length > 0
        ) {
          assignedUsers = await this.userRepository.findBy({
            id: In(updateDonationBoxDto.assigned_user_ids),
          });
          if (
            assignedUsers.length !==
            updateDonationBoxDto.assigned_user_ids.length
          ) {
            const foundIds = assignedUsers.map((user) => user.id);
            const missingIds = updateDonationBoxDto.assigned_user_ids.filter(
              (uid: number) => !foundIds.includes(uid),
            );
            throw new NotFoundException(
              `Users with IDs ${missingIds.join(", ")} not found`,
            );
          }
        }
        donationBox.assignedUsers = assignedUsers;
        auditPatch.assigned_user_ids = (assignedUsers || [])
          .map((u) => u.id)
          .sort((a, b) => a - b);
        await this.donationBoxRepository.save(donationBox);
      }

      const { assigned_user_ids: _au, ...updateData } = updateDonationBoxDto;
      const scalarPatch = this.buildDonationBoxPatch(
        updateData as Record<string, unknown>,
      );
      Object.assign(auditPatch, scalarPatch);

      if (auditUserId != null) {
        scalarPatch.updated_by = auditUserId;
      }

      const auditChanges = buildDonationBoxFieldChanges(before, auditPatch);
      if (Object.keys(scalarPatch).length > 0) {
        await this.donationBoxRepository.update(id, scalarPatch as any);
      }

      const geoFields = ["route_id", "city_id", "landmark_marketplace", "shop_name"];
      if (geoFields.some((field) => field in scalarPatch)) {
        await this.refreshDonationBoxGeoSearch(id);
      }

      if (auditChanges.length > 0) {
        const action = auditChanges.some((c) => c.field === "status")
          ? DonationBoxAuditAction.STATUS_CHANGED
          : DonationBoxAuditAction.UPDATED;
        await this.donationBoxAuditService.log({
          donationBoxId: id,
          action,
          source: DonationBoxAuditSource.STAFF_UI,
          changes: auditChanges,
          performedByUserId: auditUserId,
        });
      }

      return await this.donationBoxRepository.findOne({
        where: { id },
        relations: [
          "route",
          "route.cities",
          "route.region",
          "route.country",
          "assignedUsers",
          "created_by",
          "updated_by",
        ],
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error("Error updating donation box:", error.message);
      throw new Error(`Failed to update donation box: ${error.message}`);
    }
  }

  /**
   * Soft delete a donation box (archive)
   */
  async remove(id: number, currentUser?: any) {
    try {
      const donationBox = await this.donationBoxRepository.findOne({
        where: { id },
        relations: ["assignedUsers"],
      });

      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
      const before = this.donationBoxAuditSnapshot(donationBox);
      const archivePatch: Record<string, unknown> = { is_archived: true };
      if (auditUserId != null) {
        archivePatch.updated_by = auditUserId;
      }

      const auditChanges = buildDonationBoxFieldChanges(before, archivePatch);
      if (auditChanges.length > 0) {
        await this.donationBoxAuditService.log({
          donationBoxId: id,
          action: DonationBoxAuditAction.ARCHIVED,
          source: DonationBoxAuditSource.STAFF_UI,
          changes: auditChanges,
          performedByUserId: auditUserId,
        });
      }

      await this.donationBoxRepository.update(id, archivePatch as any);

      return { message: "Donation box archived successfully" };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error("Error archiving donation box:", error.message);
      throw new Error(`Failed to archive donation box: ${error.message}`);
    }
  }

  /**
   * Update collection statistics
   */
  async updateCollectionStats(id: number, amount: number) {
    try {
      const donationBox = await this.donationBoxRepository.findOne({
        where: { id },
      });

      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      // Update statistics
      donationBox.total_collected =
        Number(donationBox.total_collected) + Number(amount);
      donationBox.collection_count = donationBox.collection_count + 1;
      donationBox.last_collection_date = new Date();

      await this.donationBoxRepository.save(donationBox);

      return donationBox;
    } catch (error) {
      console.error("Error updating collection statistics:", error.message);
      throw new Error(
        `Failed to update collection statistics: ${error.message}`,
      );
    }
  }

  /**
   * Get active boxes by region
   */
  async findActiveByRegion(region: string): Promise<DonationBox[]> {
    try {
      return await this.donationBoxRepository.find({
        where: {
          route: {
            region: {
              name: region,
            },
          },
          is_active: true,
          is_archived: false,
        },
        order: { shop_name: "ASC" },
      });
    } catch (error) {
      console.error("Error retrieving active boxes:", error.message);
      throw new Error(`Failed to retrieve active boxes: ${error.message}`);
    }
  }

  // i want to get by key number
  async findByKeyNumber(key_number: string): Promise<DonationBox> {
    try {
      return await this.donationBoxRepository.findOne({
        where: { key_no: key_number },
      });
    } catch (error) {
      console.error("Error retrieving donation box by key number:", error);
      throw new Error(
        `Failed to retrieve donation box by key number: ${error.message}`,
      );
    }
  }

  async getDonationBoxListForDropdown(
    options?: {
      activeOnly?: boolean;
      status?: string;
    },
    geoScope?: ResolvedGeographicScope | null,
  ) {
    const queryBuilder = this.donationBoxRepository
      .createQueryBuilder("box")
      .leftJoin("box.route", "route")
      .select([
        "box.id",
        "box.key_no",
        "box.shop_name",
        "box.status",
        "box.is_active",
        "route.id",
        "route.name",
      ]);

    if (options?.activeOnly !== undefined) {
      queryBuilder.andWhere("box.is_active = :isActive", {
        isActive: options.activeOnly,
      });
    }

    if (options?.status) {
      queryBuilder.andWhere("box.status = :status", { status: options.status });
    }

    if (geoScope) {
      this.geographicScopeService.applyToQuery(
        queryBuilder,
        "donation_boxes",
        "box",
        geoScope,
      );
    }

    queryBuilder.orderBy("box.shop_name", "ASC");

    const boxes = await queryBuilder.getMany();

    return boxes.map((box) => ({
      id: box.id,
      key_no: box.key_no,
      shop_name: box.shop_name,
      status: box.status,
      is_active: box.is_active,
      route_id: box.route?.id || null,
      route_name: box.route?.name || null,
    }));
  }
}
