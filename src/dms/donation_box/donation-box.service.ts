import { CsrPoc } from "../organizations/entities/csr-poc.entity";
import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, ILike, IsNull, SelectQueryBuilder } from "typeorm";
import { BoxStatus, DonationBox } from "./entities/donation-box.entity";
import { DonationBoxPlacement } from "./entities/donation-box-placement.entity";
import { CreateDonationBoxDto } from "./dto/create-donation-box.dto";
import { UpdateDonationBoxDto } from "./dto/update-donation-box.dto";
import {
  applyCommonFilters,
  FilterPayload,
} from "../../utils/filters/common-filter.util";
import { Route } from "../geographic/routes/entities/route.entity";
import { City } from "../geographic/cities/entities/city.entity";
import { Region } from "../geographic/regions/entities/region.entity";
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
import {
  CollectionStatus,
  DonationBoxDonation,
} from "./donation_box_donation/entities/donation_box_donation.entity";

interface PaginationOptions {
  page: number;
  pageSize: number;
  type?: string;
  sortField?: string;
  sortOrder?: "ASC" | "DESC";
  search?: string;
  region?: string;
  city?: string;
  region_id?: string | number;
  city_id?: string | number;
  route_id?: string | number;
  assigned_user_id?: string | number;
  box_type?: string;
  status?: string;
  frequency?: string;
  is_active?: boolean;
  date?: string;
  start_date?: string;
  end_date?: string;
  team_filter?: string;
  team_filter_user_id?: string | number;
}

const DONATION_BOX_SORT_FIELDS = new Set([
  "created_at",
  "updated_at",
  "active_since",
  "shop_name",
  "box_id_no",
  "key_no",
  "status",
  "box_type",
  "frequency",
  "total_collected",
  "last_collection_date",
]);

@Injectable()
export class DonationBoxService {
  constructor(
    @InjectRepository(DonationBox)
    private readonly donationBoxRepository: Repository<DonationBox>,
    @InjectRepository(DonationBoxPlacement)
    private readonly placementRepository: Repository<DonationBoxPlacement>,
    @InjectRepository(DonationBoxDonation)
    private readonly donationBoxDonationRepository: Repository<DonationBoxDonation>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CsrPoc)
    private readonly pocRepository: Repository<CsrPoc>,
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

  /**
   * List visibility is Access Scope / reporting team only (no geographic filter).
   * Row is visible when created_by is in scope OR box is assigned to a scoped user.
   */
  private applyDonationBoxListDataScope(
    query: SelectQueryBuilder<DonationBox>,
    dataScope: ResolvedDataScope | null,
  ): void {
    if (!dataScope) return;
    if (
      dataScope.bypass ||
      dataScope.type === "org" ||
      dataScope.allowedUserIds == null
    ) {
      return;
    }

    const ids = Array.from(
      new Set(
        (dataScope.allowedUserIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    if (!ids.length) {
      query.andWhere("1 = 0");
      return;
    }

    query.andWhere(
      `(
        donation_box.created_by IN (:...boxListScopeUserIds)
        OR EXISTS (
          SELECT 1
          FROM donation_box_users dbu_scope
          WHERE dbu_scope.donation_box_id = donation_box.id
            AND dbu_scope.user_id IN (:...boxListScopeUserIds)
        )
      )`,
      { boxListScopeUserIds: ids },
    );
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
      removal_date: box.removal_date,
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
      "box_id_no",
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
      "removal_date",
      "notes",
      "is_active",
      "is_archived",
      "registration_latitude",
      "registration_longitude",
      "registration_location_name",
      "registration_location_details",
      "location_radius_meters",
      "require_collection_location",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (dto[key] === undefined) continue;
      if (key === "key_no" || key === "box_id_no") {
        patch[key] = this.normalizeOptionalText(dto[key]);
      } else if (key === "route_id" || key === "city_id") {
        const raw = dto[key];
        if (raw === "" || raw === null) patch[key] = null;
        else {
          const n = Number(raw);
          patch[key] = Number.isFinite(n) ? n : null;
        }
      } else {
        patch[key] = dto[key];
      }
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
      let route: Route | null = null;
      if (createDonationBoxDto.route_id != null) {
        route = await this.routeRepository.findOne({
          where: { id: createDonationBoxDto.route_id },
          relations: ["region", "country"],
        });

        if (!route) {
          throw new NotFoundException(
            `Route with ID ${createDonationBoxDto.route_id} not found`,
          );
        }
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

      if (
        createDonationBoxDto.status === BoxStatus.REMOVED &&
        !createDonationBoxDto.removal_date
      ) {
        throw new BadRequestException(
          "Removal date is required when status is Removed",
        );
      }

      // Create donation box entity
      const { assigned_user_ids, ...boxData } = createDonationBoxDto;
      const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
      const normalizedBoxIdNo = this.normalizeOptionalText(boxData.box_id_no);
      const normalizedKeyNo = this.normalizeOptionalText(boxData.key_no);
      const hasGps =
        boxData.registration_latitude != null &&
        boxData.registration_longitude != null;
      const donationBox = this.donationBoxRepository.create({
        ...boxData,
        box_id_no: normalizedBoxIdNo,
        key_no: normalizedKeyNo,
        route_id: boxData.route_id ?? null,
        city_id: boxData.city_id ?? null,
        require_collection_location: hasGps,
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
      const poc = await this.syncPocForBox(savedBox);
      await this.openPlacement({
        donationBoxId: savedBox.id,
        pocId: poc?.id ?? null,
        shopName: savedBox.shop_name,
        shopkeeper: savedBox.shopkeeper || poc?.name,
        cellNo: savedBox.cell_no || poc?.phone,
        cityId: savedBox.city_id,
        routeId: savedBox.route_id,
        startedAt: savedBox.active_since || savedBox.created_at,
        userId: auditUserId,
      });

      return savedBox;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      console.error("Error creating donation box:", error);
      throw new Error(`Failed to create donation box: ${error.message}`);
    }
  }

  /**
   * Resolve region + city + route for CSV import.
   * Finds existing entities by name; creates the route under the city if missing.
   */
  async resolveGeoForImport(params: {
    route_id?: number;
    route_name?: string;
    city_id?: number;
    city_name?: string;
    region_id?: number;
    region_name?: string;
  }): Promise<{ route_id: number | null; city_id: number; region_id?: number }> {
    let regionId = params.region_id;
    if (!regionId && params.region_name?.trim()) {
      const regions = await this.regionRepository.find({
        where: { name: ILike(params.region_name.trim()) },
      });
      if (regions.length === 0) {
        throw new NotFoundException(
          `Region "${params.region_name}" not found`,
        );
      }
      if (regions.length > 1) {
        throw new NotFoundException(
          `Multiple regions match "${params.region_name}" — use region_id`,
        );
      }
      regionId = regions[0].id;
    }

    let city: City | null = null;
    if (params.city_id) {
      city = await this.cityRepository.findOne({
        where: { id: params.city_id },
        relations: ["region", "country"],
      });
      if (!city) {
        throw new NotFoundException(`City with ID ${params.city_id} not found`);
      }
    } else if (params.city_name?.trim()) {
      const cityQb = this.cityRepository
        .createQueryBuilder("city")
        .leftJoinAndSelect("city.region", "region")
        .leftJoinAndSelect("city.country", "country")
        .where("LOWER(city.name) = LOWER(:name)", {
          name: params.city_name.trim(),
        });
      if (regionId) {
        cityQb.andWhere("city.region_id = :regionId", { regionId });
      }
      const cities = await cityQb.getMany();
      if (cities.length === 0) {
        throw new NotFoundException(
          `City "${params.city_name}" not found${
            regionId ? ` in region_id ${regionId}` : ""
          }`,
        );
      }
      if (cities.length > 1) {
        throw new NotFoundException(
          `Multiple cities match "${params.city_name}" — provide Region`,
        );
      }
      city = cities[0];
    }

    if (!city) {
      throw new NotFoundException("city_id or City is required for import");
    }

    if (!regionId && city.region_id) {
      regionId = city.region_id;
    }

    if (params.route_id) {
      const route = await this.routeRepository.findOne({
        where: { id: params.route_id },
        relations: ["cities"],
      });
      if (!route) {
        throw new NotFoundException(
          `Route with ID ${params.route_id} not found`,
        );
      }
      return { route_id: route.id, city_id: city.id, region_id: regionId };
    }

    const routeName = params.route_name?.trim();
    if (!routeName) {
      return { route_id: null, city_id: city.id, region_id: regionId };
    }

    const existingRoutes = await this.routeRepository
      .createQueryBuilder("route")
      .innerJoin("route.cities", "city")
      .where("LOWER(route.name) = LOWER(:name)", { name: routeName })
      .andWhere("city.id = :cityId", { cityId: city.id })
      .getMany();

    if (existingRoutes.length > 1) {
      throw new NotFoundException(
        `Multiple routes named "${routeName}" for city "${city.name}"`,
      );
    }

    if (existingRoutes.length === 1) {
      return {
        route_id: existingRoutes[0].id,
        city_id: city.id,
        region_id: regionId,
      };
    }

    // Create route for this city when missing
    const createRegionId = city.region_id ?? regionId;
    if (!createRegionId || !city.country_id) {
      throw new NotFoundException(
        `City "${city.name}" is missing region/country — cannot create route "${routeName}"`,
      );
    }
    const newRoute = this.routeRepository.create({
      name: routeName,
      region_id: createRegionId,
      country_id: city.country_id,
      cities: [city],
    });
    const savedRoute = await this.routeRepository.save(newRoute);

    return {
      route_id: savedRoute.id,
      city_id: city.id,
      region_id: regionId,
    };
  }

  /**
   * Resolve FRD officer reference (person name) → user id(s) for assignment.
   * Matches full name, first name, or first+last with light fuzzy tolerance.
   */
  private async resolveUserIdsByOfficerName(
    name: string | undefined,
  ): Promise<number[]> {
    const query = String(name || "").trim();
    if (!query) return [];

    const candidates = await this.userRepository.find({
      where: { is_archived: false, isActive: true },
      take: 500,
    });

    const normalize = (v: string) =>
      String(v || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    const q = normalize(query);
    let best: User | null = null;
    let bestScore = 0;

    for (const user of candidates) {
      const first = normalize(user.first_name || "");
      const last = normalize(user.last_name || "");
      const full = normalize([user.first_name, user.last_name].filter(Boolean).join(" "));
      let score = 0;
      if (full && full === q) score = 100;
      else if (first && first === q) score = 90;
      else if (full && full.includes(q)) score = 80;
      else if (q.includes(full) && full) score = 75;
      else if (first && q.includes(first) && first.length >= 3) score = 65;
      if (score > bestScore) {
        bestScore = score;
        best = user;
      }
    }

    if (best && bestScore >= 65) return [best.id];
    throw new NotFoundException(
      `FRD officer "${query}" not found among active users — check spelling or assign manually`,
    );
  }

  async importDonationBoxRow(
    row: Record<string, unknown>,
    user: any,
  ): Promise<{ box: DonationBox; skipped: boolean; skip_reason?: string }> {
    const resolved = await this.resolveGeoForImport({
      route_id: row.route_id as number | undefined,
      route_name: row.route_name as string | undefined,
      city_id: row.city_id as number | undefined,
      city_name: row.city_name as string | undefined,
      region_id: row.region_id as number | undefined,
      region_name: row.region_name as string | undefined,
    });

    let assignedUserIds = Array.isArray(row.assigned_user_ids)
      ? (row.assigned_user_ids as number[])
      : [];

    // FRD Officer Reference is a name lookup only → assignedUsers (not stored)
    const frdRef = String(row.frd_officer_reference || "").trim();
    if (assignedUserIds.length === 0 && frdRef) {
      assignedUserIds = await this.resolveUserIdsByOfficerName(frdRef);
    }

    const hasGps =
      row.registration_latitude != null && row.registration_longitude != null;

    const existing = await this.findExistingDonationBoxForImport({
      box_id_no: row.box_id_no as string | undefined,
      key_no: row.key_no as string | undefined,
      shop_name: String(row.shop_name || ""),
      shopkeeper: row.shopkeeper as string | undefined,
      cell_no: row.cell_no as string | undefined,
      city_id: resolved.city_id,
    });
    if (existing) {
      return { box: existing.box, skipped: true, skip_reason: existing.reason };
    }

    const createDto = {
      box_id_no: this.normalizeOptionalText(row.box_id_no as string | undefined),
      key_no: this.normalizeOptionalText(row.key_no as string | undefined),
      route_id: resolved.route_id ?? null,
      city_id: resolved.city_id,
      shop_name: String(row.shop_name || "").trim(),
      shopkeeper: row.shopkeeper as string | undefined,
      cell_no: row.cell_no as string | undefined,
      address: (row.address as string | undefined) || undefined,
      landmark_marketplace: row.landmark_marketplace as string | undefined,
      box_type: row.box_type,
      status: row.status,
      frequency: row.frequency,
      active_since: row.active_since,
      notes: row.notes as string | undefined,
      assigned_user_ids: assignedUserIds,
      registration_latitude: row.registration_latitude as number | undefined,
      registration_longitude: row.registration_longitude as number | undefined,
      registration_location_name:
        (row.registration_location_name as string | undefined) || undefined,
      require_collection_location:
        row.require_collection_location === true || hasGps,
    } as CreateDonationBoxDto;

    const box = await this.create(createDto, user);
    return { box, skipped: false };
  }

  /** Blank / whitespace → null so unique(box_id_no) and optional key_no stay clean. */
  private normalizeOptionalText(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s || null;
  }

  /** Resolve city/route for import rows (used by handler for in-file dedupe). */
  async resolveGeoForImportRow(
    row: Record<string, unknown>,
  ): Promise<{ route_id: number | null; city_id: number; region_id?: number }> {
    return this.resolveGeoForImport({
      route_id: row.route_id as number | undefined,
      route_name: row.route_name as string | undefined,
      city_id: row.city_id as number | undefined,
      city_name: row.city_name as string | undefined,
      region_id: row.region_id as number | undefined,
      region_name: row.region_name as string | undefined,
    });
  }

  /** Check if import row already maps to an existing box. */
  async findExistingDonationBoxForImportRow(
    row: Record<string, unknown>,
  ): Promise<{ box: DonationBox; reason: string } | null> {
    const resolved = await this.resolveGeoForImportRow(row);
    return this.findExistingDonationBoxForImport({
      box_id_no: row.box_id_no as string | undefined,
      key_no: row.key_no as string | undefined,
      shop_name: String(row.shop_name || ""),
      shopkeeper: row.shopkeeper as string | undefined,
      cell_no: row.cell_no as string | undefined,
      city_id: resolved.city_id,
    });
  }

  /**
   * Identity for import skip: only box_id_no when present.
   * Same shop_name (even with same shopkeeper/phone) is allowed — multiple boxes per shop.
   */
  private async findExistingDonationBoxForImport(params: {
    box_id_no?: string | null;
    key_no?: string | null;
    shop_name?: string | null;
    shopkeeper?: string | null;
    cell_no?: string | null;
    city_id?: number | null;
  }): Promise<{ box: DonationBox; reason: string } | null> {
    const boxIdNo = String(params.box_id_no || "")
      .trim()
      .toLowerCase();

    if (!boxIdNo) {
      return null;
    }

    const byBoxId = await this.donationBoxRepository
      .createQueryBuilder("b")
      .where("b.is_archived = false")
      .andWhere("LOWER(TRIM(b.box_id_no)) = :boxIdNo", { boxIdNo })
      .orderBy("b.id", "ASC")
      .getOne();

    if (byBoxId) {
      return {
        box: byBoxId,
        reason: `Already in DB (matched box_id_no="${params.box_id_no}" → id ${byBoxId.id})`,
      };
    }

    return null;
  }

  private applyDonationBoxActiveSinceDateFilter(
    query: SelectQueryBuilder<DonationBox>,
    filters: {
      date?: string;
      start_date?: string;
      end_date?: string;
    },
  ): void {
    const dateField = "donation_box.active_since";
    if (filters.start_date && filters.end_date) {
      query.andWhere(`${dateField} BETWEEN :dbStartDate AND :dbEndDate`, {
        dbStartDate: filters.start_date,
        dbEndDate: filters.end_date,
      });
    } else if (filters.start_date) {
      query.andWhere(`${dateField} >= :dbStartDate`, {
        dbStartDate: filters.start_date,
      });
    } else if (filters.end_date) {
      query.andWhere(`${dateField} <= :dbEndDate`, {
        dbEndDate: filters.end_date,
      });
    } else if (filters.date) {
      query.andWhere(`${dateField} = :dbExactDate`, {
        dbExactDate: filters.date,
      });
    }
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
        region_id = "",
        city_id = "",
        route_id = "",
        assigned_user_id = "",
        box_type = "",
        status = "",
        frequency = "",
        is_active,
        date = "",
        start_date,
        end_date,
        team_filter,
        team_filter_user_id,
      } = options;

      const skip = (page - 1) * pageSize;

      // Define searchable fields (only string fields that can be used with LOWER())
      const searchFields = [
        "box_id_no",
        "key_no",
        "shop_name",
        "shopkeeper",
        "cell_no",
        "address",
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
        .leftJoinAndSelect("donation_box.assignedUsers", "assignedUsers")
        .where("donation_box.is_archived = false");

      // Apply common filters (direct columns only — geo/date handled below)
      const filters: FilterPayload = {
        search,
        box_type,
        status,
        frequency,
      };

      if (is_active !== undefined) {
        filters.is_active = is_active;
      }

      applyCommonFilters(query, filters, searchFields, "donation_box");

      // Boxes store city_id (not region_id). Region filter → cities in region → boxes.
      const cityId = Number(city_id);
      if (Number.isFinite(cityId) && cityId > 0) {
        query.andWhere("donation_box.city_id = :filterCityId", {
          filterCityId: cityId,
        });
      } else if (city && String(city).trim()) {
        query.andWhere(
          `(LOWER(cities.name) = LOWER(:filterCityName) OR donation_box.city_id IN (
            SELECT c.id FROM cities c WHERE LOWER(c.name) = LOWER(:filterCityName)
          ))`,
          { filterCityName: String(city).trim() },
        );
      } else {
        const regionId = Number(region_id);
        let regionCityIds: number[] | null = null;

        if (Number.isFinite(regionId) && regionId > 0) {
          const cityRows = await this.cityRepository.find({
            where: { region_id: regionId, is_active: true },
            select: ["id"],
          });
          regionCityIds = cityRows.map((c) => c.id);
        } else if (region && String(region).trim()) {
          const cityRows = await this.cityRepository
            .createQueryBuilder("c")
            .innerJoin("c.region", "r")
            .select(["c.id"])
            .where("c.is_active = true")
            .andWhere("LOWER(r.name) = LOWER(:filterRegionName)", {
              filterRegionName: String(region).trim(),
            })
            .getMany();
          regionCityIds = cityRows.map((c) => c.id);
        }

        if (regionCityIds) {
          if (!regionCityIds.length) {
            query.andWhere("1 = 0");
          } else {
            query.andWhere(
              "donation_box.city_id IN (:...filterRegionCityIds)",
              { filterRegionCityIds: regionCityIds },
            );
          }
        }
      }

      const routeId = Number(route_id);
      if (Number.isFinite(routeId) && routeId > 0) {
        query.andWhere("donation_box.route_id = :filterRouteId", {
          filterRouteId: routeId,
        });
      }

      const assigneeId = Number(assigned_user_id);
      if (Number.isFinite(assigneeId) && assigneeId > 0) {
        query.andWhere(
          `EXISTS (
            SELECT 1 FROM donation_box_users dbu
            WHERE dbu.donation_box_id = donation_box.id
            AND dbu.user_id = :filterAssigneeId
          )`,
          { filterAssigneeId: assigneeId },
        );
      }

      this.applyDonationBoxActiveSinceDateFilter(query, {
        date,
        start_date,
        end_date,
      });

      // Listing: Access Scope / team only — geographic filter intentionally skipped.
      // Registration / single-record geo checks remain unchanged elsewhere.
      if (currentUser?.id) {
        const scope = await this.dataScopeService.resolveListScope({
          userId: currentUser.id,
          userRole: currentUser.role,
          userDepartment: currentUser.department,
          permissionDepartment: "fund_raising",
          module: "donation_box",
          teamFilter: team_filter,
          teamFilterUserId: team_filter_user_id,
        });
        this.applyDonationBoxListDataScope(query, scope);
      }

      // 1. SUM(total_collected) with same filters — de-dupe joins (e.g. assignedUsers)
      let totalDonationAmount = 0;
      try {
        const sumQuery = query.clone();
        sumQuery.expressionMap.orderBys = {};
        sumQuery.expressionMap.selects = [];
        // Avoid invalid "SELECT col, DISTINCT id" from select("DISTINCT ...")
        sumQuery.select("donation_box.id", "id");
        sumQuery.addSelect(
          "MAX(donation_box.total_collected)",
          "total_collected",
        );
        sumQuery.groupBy("donation_box.id");

        const [sql, params] = sumQuery.getQueryAndParameters();
        const rawResult = await this.donationBoxRepository.query(
          `SELECT COALESCE(SUM(sub.total_collected), 0) AS "totalDonationAmount" FROM (${sql}) AS sub`,
          params,
        );
        totalDonationAmount = Number(rawResult?.[0]?.totalDonationAmount) || 0;
      } catch (sumError) {
        console.warn(
          "Could not calculate donation box total collected amount:",
          sumError,
        );
        totalDonationAmount = 0;
      }

      // 2. Apply sorting (whitelist to prevent SQL injection)
      const safeSortField = DONATION_BOX_SORT_FIELDS.has(sortField || "")
        ? sortField!
        : "created_at";
      query.orderBy(`donation_box.${safeSortField}`, sortOrder);

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
        totalDonationAmount,
      };
    } catch (error) {
      console.error("Error retrieving donation boxes:", error);
      throw new Error(`Failed to retrieve donation boxes: ${error.message}`);
    }
  }

  private toDateOnly(value?: string | Date | null): string {
    if (!value) {
      return new Date().toISOString().slice(0, 10);
    }
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return parsed.toISOString().slice(0, 10);
  }

  private dayBefore(value: string | Date): string {
    const base = this.toDateOnly(value);
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  private async syncPocForBox(box: DonationBox): Promise<CsrPoc | null> {
    try {
      if (!box?.id) return null;
      const pocType = box.type === "Mosques" ? "Mosques" : "Donation Boxes";
      const pocName = (box.shopkeeper?.trim() || box.name?.trim() || box.shop_name?.trim() || "Contact Person");
      const pocPhone = box.cell_no?.trim() || null;

      let poc = await this.pocRepository.findOne({
        where: { donation_box_id: box.id, is_archived: false },
        order: { is_primary: "DESC", id: "ASC" },
      });

      if (poc) {
        poc.name = pocName;
        poc.phone = pocPhone;
        poc.type = pocType;
        return await this.pocRepository.save(poc);
      }

      poc = this.pocRepository.create({
        donation_box_id: box.id,
        type: pocType,
        name: pocName,
        phone: pocPhone,
        role: "contact",
        is_primary: true,
        is_active: true,
      });
      return await this.pocRepository.save(poc);
    } catch (err: any) {
      console.warn("Failed to sync POC for donation box:", err?.message);
      return null;
    }
  }

  private async createPocForBox(box: DonationBox): Promise<CsrPoc | null> {
    try {
      if (!box?.id) return null;
      const pocType = box.type === "Mosques" ? "Mosques" : "Donation Boxes";
      const pocName =
        box.shopkeeper?.trim() ||
        box.name?.trim() ||
        box.shop_name?.trim() ||
        "Contact Person";
      const poc = this.pocRepository.create({
        donation_box_id: box.id,
        type: pocType,
        name: pocName,
        phone: box.cell_no?.trim() || null,
        role: "contact",
        is_primary: true,
        is_active: true,
      });
      return await this.pocRepository.save(poc);
    } catch (err: any) {
      console.warn("Failed to create POC for donation box:", err?.message);
      return null;
    }
  }

  private async findOpenPlacement(
    donationBoxId: number,
  ): Promise<DonationBoxPlacement | null> {
    return this.placementRepository.findOne({
      where: {
        donation_box_id: donationBoxId,
        ended_at: IsNull(),
        is_archived: false,
      },
      order: { id: "DESC" },
    });
  }

  private async openPlacement(params: {
    donationBoxId: number;
    pocId?: number | null;
    shopName?: string | null;
    shopkeeper?: string | null;
    cellNo?: string | null;
    cityId?: number | null;
    routeId?: number | null;
    startedAt?: string | Date | null;
    note?: string | null;
    userId?: number | null;
  }): Promise<DonationBoxPlacement> {
    const placement = this.placementRepository.create({
      donation_box_id: params.donationBoxId,
      csr_poc_id: params.pocId ?? null,
      shop_name: params.shopName?.trim() || null,
      shopkeeper: params.shopkeeper?.trim() || null,
      cell_no: params.cellNo?.trim() || null,
      city_id: params.cityId ?? null,
      route_id: params.routeId ?? null,
      started_at: this.toDateOnly(params.startedAt) as any,
      ended_at: null,
      note: params.note?.trim() || null,
      ...(params.userId != null
        ? { created_by: { id: params.userId } as any }
        : {}),
    });
    return this.placementRepository.save(placement);
  }

  private async closeOpenPlacementsForBox(
    donationBoxId: number,
    endedAt: string | Date,
    userId?: number | null,
  ): Promise<void> {
    const openRows = await this.placementRepository.find({
      where: {
        donation_box_id: donationBoxId,
        ended_at: IsNull(),
        is_archived: false,
      },
    });
    if (!openRows.length) return;
    const requestedEnd = this.toDateOnly(endedAt);
    for (const row of openRows) {
      const started = this.toDateOnly(row.started_at);
      row.ended_at = (requestedEnd < started ? started : requestedEnd) as any;
      if (userId != null) {
        row.updated_by = { id: userId } as any;
      }
      await this.placementRepository.save(row);
    }
  }

  private async closeOpenPlacementsForPoc(
    pocId: number,
    endedAt: string | Date,
    exceptBoxId?: number,
    userId?: number | null,
  ): Promise<void> {
    const qb = this.placementRepository
      .createQueryBuilder("p")
      .where("p.csr_poc_id = :pocId", { pocId })
      .andWhere("p.ended_at IS NULL")
      .andWhere("p.is_archived = false");
    if (exceptBoxId != null) {
      qb.andWhere("p.donation_box_id != :exceptBoxId", { exceptBoxId });
    }
    const openRows = await qb.getMany();
    if (!openRows.length) return;
    const requestedEnd = this.toDateOnly(endedAt);
    for (const row of openRows) {
      const started = this.toDateOnly(row.started_at);
      row.ended_at = (requestedEnd < started ? started : requestedEnd) as any;
      if (userId != null) {
        row.updated_by = { id: userId } as any;
      }
      await this.placementRepository.save(row);
    }
  }

  /** Ensure the box has an open placement snapshot (backfill from current fields). */
  private async ensureOpenPlacement(
    box: DonationBox,
    userId?: number | null,
  ): Promise<DonationBoxPlacement> {
    const existing = await this.findOpenPlacement(box.id);
    if (existing) return existing;

    const poc = await this.pocRepository.findOne({
      where: { donation_box_id: box.id, is_archived: false },
      order: { is_primary: "DESC", id: "ASC" },
    });

    return this.openPlacement({
      donationBoxId: box.id,
      pocId: poc?.id ?? null,
      shopName: box.shop_name,
      shopkeeper: box.shopkeeper || poc?.name,
      cellNo: box.cell_no || poc?.phone,
      cityId: box.city_id,
      routeId: box.route_id,
      startedAt: box.active_since || box.created_at,
      userId,
    });
  }

  private async sumCollectionsForPeriod(params: {
    donationBoxId: number;
    startedAt: string | Date;
    endedAt?: string | Date | null;
    rangeStart?: string | null;
    rangeEnd?: string | null;
  }): Promise<{ collection_amount: number; collection_count: number }> {
    const periodStart = this.toDateOnly(params.startedAt);
    const periodEnd = params.endedAt ? this.toDateOnly(params.endedAt) : null;
    const rangeStart = params.rangeStart
      ? this.toDateOnly(params.rangeStart)
      : null;
    const rangeEnd = params.rangeEnd ? this.toDateOnly(params.rangeEnd) : null;

    const start =
      rangeStart && rangeStart > periodStart ? rangeStart : periodStart;
    let end = periodEnd;
    if (rangeEnd) {
      end = !end || rangeEnd < end ? rangeEnd : end;
    }

    if (end && end < start) {
      return { collection_amount: 0, collection_count: 0 };
    }

    const qb = this.donationBoxDonationRepository
      .createQueryBuilder("c")
      .select("COALESCE(SUM(c.collection_amount), 0)", "total")
      .addSelect("COUNT(c.id)", "count")
      .where("c.donation_box_id = :boxId", { boxId: params.donationBoxId })
      .andWhere("c.is_archived = false")
      .andWhere("c.status != :cancelled", {
        cancelled: CollectionStatus.CANCELLED,
      })
      .andWhere("c.collection_date >= :start", { start });

    if (end) {
      // Inclusive end date for closed periods and filter ranges
      qb.andWhere("c.collection_date <= :end", { end });
    }

    const raw = await qb.getRawOne();
    return {
      collection_amount: Number(raw?.total || 0),
      collection_count: Number(raw?.count || 0),
    };
  }

  private async mapPlacementHistory(
    placements: DonationBoxPlacement[],
    rangeStart?: string | null,
    rangeEnd?: string | null,
  ) {
    const rows = [];
    let totalAmount = 0;
    let totalCount = 0;

    for (const placement of placements) {
      const stats = await this.sumCollectionsForPeriod({
        donationBoxId: placement.donation_box_id,
        startedAt: placement.started_at,
        endedAt: placement.ended_at,
        rangeStart,
        rangeEnd,
      });
      totalAmount += stats.collection_amount;
      totalCount += stats.collection_count;
      rows.push({
        id: placement.id,
        donation_box_id: placement.donation_box_id,
        csr_poc_id: placement.csr_poc_id,
        shop_name: placement.shop_name,
        shopkeeper: placement.shopkeeper,
        cell_no: placement.cell_no,
        city_id: placement.city_id,
        route_id: placement.route_id,
        started_at: placement.started_at,
        ended_at: placement.ended_at,
        note: placement.note,
        is_current: placement.ended_at == null,
        collection_amount: stats.collection_amount,
        collection_count: stats.collection_count,
        donation_box: placement.donation_box
          ? {
              id: placement.donation_box.id,
              box_id_no: placement.donation_box.box_id_no,
              key_no: placement.donation_box.key_no,
              shop_name: placement.donation_box.shop_name,
              name: placement.donation_box.name,
              type: placement.donation_box.type,
            }
          : null,
        poc: placement.csr_poc
          ? {
              id: placement.csr_poc.id,
              name: placement.csr_poc.name,
              phone: placement.csr_poc.phone,
              email: placement.csr_poc.email,
              type: placement.csr_poc.type,
            }
          : null,
        city: placement.city
          ? { id: placement.city.id, name: placement.city.name }
          : null,
        route: placement.route
          ? { id: placement.route.id, name: placement.route.name }
          : null,
      });
    }

    return {
      placements: rows,
      summary: {
        placement_count: rows.length,
        collection_amount: totalAmount,
        collection_count: totalCount,
        range_start: rangeStart || null,
        range_end: rangeEnd || null,
      },
    };
  }

  async getPlacementHistoryForBox(
    donationBoxId: number,
    opts?: { start_date?: string; end_date?: string },
  ) {
    const box = await this.findOne(donationBoxId);
    await this.ensureOpenPlacement(box);

    const qb = this.placementRepository
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.csr_poc", "poc")
      .leftJoinAndSelect("p.donation_box", "box")
      .leftJoinAndSelect("p.city", "city")
      .leftJoinAndSelect("p.route", "route")
      .where("p.donation_box_id = :donationBoxId", { donationBoxId })
      .andWhere("p.is_archived = false")
      .orderBy("p.started_at", "DESC")
      .addOrderBy("p.id", "DESC");

    const start = opts?.start_date ? this.toDateOnly(opts.start_date) : null;
    const end = opts?.end_date ? this.toDateOnly(opts.end_date) : null;
    if (start) {
      qb.andWhere("(p.ended_at IS NULL OR p.ended_at >= :start)", { start });
    }
    if (end) {
      qb.andWhere("p.started_at <= :end", { end });
    }

    const placements = await qb.getMany();
    return this.mapPlacementHistory(placements, start, end);
  }

  async getPlacementHistoryForPoc(
    pocId: number,
    opts?: { start_date?: string; end_date?: string },
  ) {
    const poc = await this.pocRepository.findOne({
      where: { id: pocId, is_archived: false },
    });
    if (!poc) {
      throw new NotFoundException(`POC with ID ${pocId} not found`);
    }

    const qb = this.placementRepository
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.csr_poc", "poc")
      .leftJoinAndSelect("p.donation_box", "box")
      .leftJoinAndSelect("p.city", "city")
      .leftJoinAndSelect("p.route", "route")
      .where("p.csr_poc_id = :pocId", { pocId })
      .andWhere("p.is_archived = false")
      .orderBy("p.started_at", "DESC")
      .addOrderBy("p.id", "DESC");

    const start = opts?.start_date ? this.toDateOnly(opts.start_date) : null;
    const end = opts?.end_date ? this.toDateOnly(opts.end_date) : null;
    if (start) {
      qb.andWhere("(p.ended_at IS NULL OR p.ended_at >= :start)", { start });
    }
    if (end) {
      qb.andWhere("p.started_at <= :end", { end });
    }

    const placements = await qb.getMany();
    const history = await this.mapPlacementHistory(placements, start, end);
    return {
      poc: {
        id: poc.id,
        name: poc.name,
        phone: poc.phone,
        email: poc.email,
        type: poc.type,
        donation_box_id: poc.donation_box_id,
      },
      ...history,
    };
  }

  /**
   * Find one donation box by ID
   */
  async findOne(id: number): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({
        where: { id, is_archived: false },
        relations: [
          "route",
          "route.cities",
          "route.region",
          "route.country",
          "city",
          "city.region",
          "assignedUsers",
          "created_by",
          "updated_by",
        ],
      });

      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      const poc = await this.pocRepository.findOne({
        where: { donation_box_id: id, is_archived: false },
        order: { is_primary: "DESC", id: "ASC" },
      });
      (donationBox as any).poc = poc || null;

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

      if (updateDonationBoxDto.route_id != null) {
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

      const nextStatus =
        (scalarPatch.status as BoxStatus | undefined) ?? donationBox.status;
      if (nextStatus === BoxStatus.REMOVED) {
        const providedRemovalDate =
          scalarPatch.removal_date !== undefined
            ? scalarPatch.removal_date
            : donationBox.removal_date;
        if (
          providedRemovalDate === undefined ||
          providedRemovalDate === null ||
          providedRemovalDate === ""
        ) {
          throw new BadRequestException(
            "Removal date is required when status is Removed",
          );
        }
        scalarPatch.removal_date = providedRemovalDate;
      } else if (scalarPatch.status !== undefined) {
        scalarPatch.removal_date = null;
      }

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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error("Error updating donation box:", error.message);
      throw new Error(`Failed to update donation box: ${error.message}`);
    }
  }

  /**
   * Relocate box to a new shop (optional GPS). Logs shop_relocated audit entry
   * and maintains POC/box placement history periods.
   *
   * Optional `poc_id` attaches an existing POC to this placement.
   * Without it, a new POC is created from shopkeeper/cell fields.
   */
  async relocate(
    id: number,
    dto: Record<string, unknown>,
    currentUser?: any,
  ): Promise<DonationBox> {
    const existing = await this.donationBoxRepository.findOne({
      where: { id, is_archived: false },
      relations: ["route", "city"],
    });
    if (!existing) {
      throw new NotFoundException(`Donation box with ID ${id} not found`);
    }

    const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
    const previousPoc = await this.pocRepository.findOne({
      where: { donation_box_id: id, is_archived: false },
      order: { is_primary: "DESC", id: "ASC" },
    });

    const previous_shop = {
      shop_name: existing.shop_name,
      shopkeeper: existing.shopkeeper,
      poc_id: previousPoc?.id ?? null,
      route_name: existing.route?.name ?? null,
      city_name:
        existing.city?.name ??
        (await this.resolveCityName(existing.city_id)),
    };

    const {
      relocation_note,
      poc_id: rawPocId,
      ...updateDto
    } = dto;

    if (!updateDto.shop_name || !String(updateDto.shop_name).trim()) {
      throw new Error("Shop name is required to relocate the box");
    }

    const selectedPocId =
      rawPocId != null && String(rawPocId).trim() !== ""
        ? Number(rawPocId)
        : null;
    if (selectedPocId != null && !Number.isFinite(selectedPocId)) {
      throw new BadRequestException("Invalid poc_id");
    }

    let selectedPoc: CsrPoc | null = null;
    if (selectedPocId != null) {
      selectedPoc = await this.pocRepository.findOne({
        where: { id: selectedPocId, is_archived: false },
      });
      if (!selectedPoc) {
        throw new NotFoundException(`POC with ID ${selectedPocId} not found`);
      }
      if (
        !updateDto.shopkeeper &&
        selectedPoc.name
      ) {
        updateDto.shopkeeper = selectedPoc.name;
      }
      if (!updateDto.cell_no && selectedPoc.phone) {
        updateDto.cell_no = selectedPoc.phone;
      }
    }

    const placementStartAt =
      (updateDto.active_since as string | Date | undefined) ||
      new Date();
    const newStart = this.toDateOnly(placementStartAt);
    // Close previous period the day before the new placement starts so
    // same-day collections belong to the new POC/shop.
    const previousEnd = this.dayBefore(newStart);

    await this.ensureOpenPlacement(existing, auditUserId);
    await this.closeOpenPlacementsForBox(id, previousEnd, auditUserId);

    await this.update(id, updateDto, currentUser);
    let updated = await this.findOne(id);

    // Detach previous POC from this box when switching contact
    if (previousPoc && previousPoc.id !== selectedPocId) {
      previousPoc.donation_box_id = null;
      previousPoc.is_primary = false;
      await this.pocRepository.save(previousPoc);
    }

    let nextPoc: CsrPoc | null = null;
    if (selectedPoc) {
      if (
        selectedPoc.donation_box_id &&
        selectedPoc.donation_box_id !== id
      ) {
        await this.closeOpenPlacementsForPoc(
          selectedPoc.id,
          previousEnd,
          id,
          auditUserId,
        );
      }
      selectedPoc.donation_box_id = id;
      selectedPoc.is_primary = true;
      selectedPoc.is_active = true;
      if (updateDto.shopkeeper) {
        selectedPoc.name = String(updateDto.shopkeeper).trim() || selectedPoc.name;
      }
      if (updateDto.cell_no !== undefined) {
        selectedPoc.phone = updateDto.cell_no
          ? String(updateDto.cell_no).trim()
          : selectedPoc.phone;
      }
      const pocType = updated.type === "Mosques" ? "Mosques" : "Donation Boxes";
      if (
        selectedPoc.type === "Donation Boxes" ||
        selectedPoc.type === "Mosques" ||
        !selectedPoc.type
      ) {
        selectedPoc.type = pocType;
      }
      nextPoc = await this.pocRepository.save(selectedPoc);
    } else {
      nextPoc = await this.createPocForBox(updated);
    }

    await this.openPlacement({
      donationBoxId: id,
      pocId: nextPoc?.id ?? null,
      shopName: updated.shop_name,
      shopkeeper: updated.shopkeeper || nextPoc?.name,
      cellNo: updated.cell_no || nextPoc?.phone,
      cityId: updated.city_id,
      routeId: updated.route_id,
      startedAt: updated.active_since || newStart,
      note: relocation_note ? String(relocation_note).trim() || null : null,
      userId: auditUserId,
    });

    updated = await this.findOne(id);

    const new_shop = {
      shop_name: updated.shop_name,
      shopkeeper: updated.shopkeeper,
      poc_id: nextPoc?.id ?? null,
      route_name: updated.route?.name ?? null,
      city_name:
        updated.city?.name ?? (await this.resolveCityName(updated.city_id)),
    };

    await this.donationBoxAuditService.log({
      donationBoxId: id,
      action: DonationBoxAuditAction.SHOP_RELOCATED,
      source: DonationBoxAuditSource.STAFF_UI,
      changes: [
        {
          field: "shop_name",
          old_value: previous_shop.shop_name ?? null,
          new_value: new_shop.shop_name ?? null,
        },
      ],
      performedByUserId: auditUserId,
      metadata: {
        previous_shop,
        new_shop,
        poc_id: nextPoc?.id ?? null,
        previous_poc_id: previousPoc?.id ?? null,
        relocation_note: relocation_note
          ? String(relocation_note).trim() || null
          : null,
      },
    });

    return updated;
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
        where: { key_no: key_number, is_archived: false },
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
      ])
      .where("box.is_archived = false");

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
