import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, ILike, SelectQueryBuilder } from "typeorm";
import { DonationBox } from "./entities/donation-box.entity";
import { CreateDonationBoxDto } from "./dto/create-donation-box.dto";
import { UpdateDonationBoxDto } from "./dto/update-donation-box.dto";
import { RelocateDonationBoxDto } from "./dto/relocate-donation-box.dto";
import {
  applyCommonFilters,
  applyDateFilterOnColumn,
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
import { DEFAULT_DONATION_BOX_COLLECTION_RADIUS_METERS } from "../../utils/geo/geo-distance.util";
import { reverseGeocodeLocationDetails } from "../../utils/geo/reverse-geocode.util";
import { ResolvedLocationDetails } from "../../utils/geo/location-details.types";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationType } from "../../notifications/entities/notification.entity";
import { EmailService } from "../../email/email.service";
import { PermissionsEntity } from "../../permissions/entities/permissions.entity";

interface PaginationOptions {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: "ASC" | "DESC";
  search?: string;
  region_id?: number | string;
  city_id?: number | string;
  route_id?: number | string;
  assigned_user_id?: number | string;
  box_type?: string;
  status?: string;
  frequency?: string;
  is_active?: boolean;
  date?: string;
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class DonationBoxService {
  private readonly logger = new Logger(DonationBoxService.name);

  constructor(
    @InjectRepository(DonationBox)
    private readonly donationBoxRepository: Repository<DonationBox>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PermissionsEntity)
    private readonly permissionsRepository: Repository<PermissionsEntity>,
    private readonly donationBoxAuditService: DonationBoxAuditService,
    private readonly dataScopeService: DataScopeService,
    private readonly geographicScopeService: GeographicScopeService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
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
    this.dataScopeService.applyToQuery(query, "donation_box", dataScope, {
      assignedToColumn: "assignedUsers.id",
    });
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

      if (boxData.require_collection_location !== false) {
        await this.enrichRegistrationLocationFields(boxData);
      }

      const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
      const donationBox = this.donationBoxRepository.create({
        ...boxData,
        require_collection_location: boxData.require_collection_location !== false,
        location_radius_meters:
          boxData.location_radius_meters ||
          DEFAULT_DONATION_BOX_COLLECTION_RADIUS_METERS,
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
  }): Promise<{ route_id: number; city_id: number; region_id?: number }> {
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
      throw new NotFoundException("route_id or Route is required");
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
      throw new BadRequestException(
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

  async resolveLocationDetails(
    latitude: number,
    longitude: number,
  ): Promise<ResolvedLocationDetails | null> {
    return reverseGeocodeLocationDetails(latitude, longitude);
  }

  async resolveLocationName(
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    const details = await this.resolveLocationDetails(latitude, longitude);
    return details?.display_name || null;
  }

  private async enrichRegistrationLocationFields<
    T extends {
      registration_latitude?: number;
      registration_longitude?: number;
      registration_location_name?: string;
      registration_location_details?: Record<string, string> | null;
    },
  >(boxData: T): Promise<T> {
    if (
      boxData.registration_latitude == null ||
      boxData.registration_longitude == null
    ) {
      return boxData;
    }

    if (boxData.registration_location_details) {
      if (!boxData.registration_location_name) {
        boxData.registration_location_name =
          boxData.registration_location_details.display_name || undefined;
      }
      return boxData;
    }

    const details = await reverseGeocodeLocationDetails(
      Number(boxData.registration_latitude),
      Number(boxData.registration_longitude),
    );

    if (details) {
      boxData.registration_location_details = details as Record<string, string>;
      boxData.registration_location_name =
        boxData.registration_location_name || details.display_name || undefined;
    }

    return boxData;
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
  ): Promise<DonationBox> {
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

    const createDto = {
      box_id_no: (row.box_id_no as string | undefined) || undefined,
      key_no: row.key_no as string | undefined,
      route_id: resolved.route_id,
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
        region_id,
        city_id,
        route_id,
        assigned_user_id,
        box_type = "",
        status = "",
        frequency = "",
        is_active,
        date,
        start_date,
        end_date,
      } = options;

      const skip = (page - 1) * pageSize;

      const searchFields = [
        "box_id_no",
        "key_no",
        "shop_name",
        "shopkeeper",
        "cell_no",
        "address",
        "landmark_marketplace",
        "route.name",
      ];

      const query = this.donationBoxRepository
        .createQueryBuilder("donation_box")
        .leftJoinAndSelect("donation_box.route", "route")
        .leftJoinAndSelect("route.region", "region")
        .leftJoinAndSelect("route.country", "country")
        .leftJoinAndMapOne(
          "donation_box.city",
          City,
          "box_city",
          "box_city.id = donation_box.city_id",
        )
        .leftJoinAndSelect("donation_box.assignedUsers", "assignedUsers")
        .where("donation_box.is_archived = :archived", { archived: false });

      const filters: FilterPayload = {
        search,
        box_type,
        status,
        frequency,
      };

      if (city_id) {
        filters.city_id = city_id;
      }
      if (route_id) {
        filters.route_id = route_id;
      }

      applyCommonFilters(query, filters, searchFields, "donation_box");

      applyDateFilterOnColumn(
        query,
        { date, start_date, end_date },
        "donation_box",
        "active_since",
      );

      if (region_id) {
        query.andWhere("region.id = :regionId", {
          regionId: Number(region_id),
        });
      }

      if (assigned_user_id) {
        query.andWhere("assignedUsers.id = :assignedUserId", {
          assignedUserId: Number(assigned_user_id),
        });
      }

      if (is_active !== undefined) {
        query.andWhere("donation_box.is_active = :isActive", {
          isActive: is_active,
        });
      }

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
      const allowedSortFields = [
        "created_at",
        "active_since",
        "box_id_no",
        "shop_name",
        "box_type",
        "status",
        "key_no",
      ];
      const safeSortField = allowedSortFields.includes(sortField)
        ? sortField
        : "created_at";
      query.orderBy(`donation_box.${safeSortField}`, sortOrder);

      query.distinct(true);

      // Apply pagination
      query.skip(skip).take(pageSize);

      // Execute query — count without collection joins to avoid inflated totals
      const total = await query.clone().skip(undefined).take(undefined).getCount();
      const data = await query.getMany();
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

  private formatUserName(user?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    id?: number;
  } | null): string {
    if (!user) return "Unknown user";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return name || user.email || `User #${user.id}`;
  }

  private async buildShopPlacementSummary(
    box: DonationBox,
  ): Promise<Record<string, unknown>> {
    const cityName = await this.resolveCityName(box.city_id);
    const assignees = (box.assignedUsers || [])
      .map((u) => this.formatUserName(u))
      .join(", ");
    return {
      key_no: box.key_no,
      shop_name: box.shop_name,
      shopkeeper: box.shopkeeper,
      cell_no: box.cell_no,
      landmark_marketplace: box.landmark_marketplace,
      route_id: box.route_id,
      route_name: box.route?.name ?? null,
      city_id: box.city_id,
      city_name: cityName,
      region_name: box.route?.region?.name ?? null,
      assigned_officers: assignees || null,
      active_since: box.active_since,
    };
  }

  private async resolveRelocationNotifyTargets(performerUserId: number): Promise<{
    userIds: number[];
    emails: string[];
  }> {
    const performer = await this.userRepository.findOne({
      where: { id: performerUserId, is_archived: false },
      relations: ["manager"],
    });

    const userIds = new Set<number>();
    const emails = new Set<string>();

    if (performer?.manager_id) {
      userIds.add(Number(performer.manager_id));
      const manager =
        performer.manager ||
        (await this.userRepository.findOne({
          where: { id: performer.manager_id, is_archived: false },
          select: ["id", "email", "first_name", "last_name"],
        }));
      if (manager?.email) {
        emails.add(manager.email);
      }
    }

    if (userIds.size === 0) {
      const managerRows = await this.permissionsRepository
        .createQueryBuilder("perm")
        .select("perm.user_id", "user_id")
        .where(`perm.permissions->>'fund_raising_manager' = 'true'`)
        .getRawMany();

      for (const row of managerRows) {
        const uid = Number(row.user_id);
        if (Number.isFinite(uid) && uid > 0) {
          userIds.add(uid);
        }
      }

      if (userIds.size > 0) {
        const managers = await this.userRepository.findBy({
          id: In(Array.from(userIds)),
        });
        managers.forEach((manager) => {
          if (manager.email) emails.add(manager.email);
        });
      }
    }

    return {
      userIds: Array.from(userIds),
      emails: Array.from(emails),
    };
  }

  private async notifyManagerOnRelocation(params: {
    donationBoxId: number;
    keyNo: string | null;
    performer: User | null;
    previousShop: Record<string, unknown>;
    newShop: Record<string, unknown>;
    relocationNote?: string | null;
  }): Promise<void> {
    if (!params.performer?.id) return;

    try {
      const { userIds, emails } = await this.resolveRelocationNotifyTargets(
        params.performer.id,
      );
      if (userIds.length === 0) {
        this.logger.warn(
          `No manager recipients for donation box #${params.donationBoxId} relocation`,
        );
        return;
      }

      const boxLabel = params.keyNo
        ? `Key ${params.keyNo}`
        : `Box #${params.donationBoxId}`;
      const fromShop = String(params.previousShop.shop_name || "—");
      const toShop = String(params.newShop.shop_name || "—");

      await this.notificationsService.create(
        {
          title: "Donation box relocated to new shop",
          message: `${this.formatUserName(params.performer)} moved ${boxLabel} from "${fromShop}" to "${toShop}".`,
          type: NotificationType.INFO,
          link: `/dms/donation_box/view/${params.donationBoxId}`,
          metadata: {
            donation_box_id: params.donationBoxId,
            action: "donation_box_shop_relocated",
            previous_shop: params.previousShop,
            new_shop: params.newShop,
            relocation_note: params.relocationNote || null,
          },
        },
        userIds,
        params.performer,
      );

      if (emails.length > 0) {
        await this.emailService.sendDonationBoxRelocationEmail({
          to: emails,
          performerName: this.formatUserName(params.performer),
          boxLabel,
          donationBoxId: params.donationBoxId,
          previousShop: params.previousShop,
          newShop: params.newShop,
          relocationNote: params.relocationNote,
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed relocation notifications for box #${params.donationBoxId}: ${error?.message}`,
      );
    }
  }

  /**
   * Move an existing physical box to a new shop / location.
   * Writes a dedicated audit record and notifies the reporting manager.
   */
  async relocateToNewShop(
    id: number,
    dto: RelocateDonationBoxDto,
    currentUser?: { id?: number },
  ): Promise<DonationBox> {
    const donationBox = await this.donationBoxRepository.findOne({
      where: { id, is_archived: false },
      relations: ["assignedUsers", "route", "route.region", "route.cities"],
    });

    if (!donationBox) {
      throw new NotFoundException(`Donation box with ID ${id} not found`);
    }

    const route = await this.routeRepository.findOne({
      where: { id: dto.route_id },
      relations: ["region"],
    });
    if (!route) {
      throw new NotFoundException(`Route with ID ${dto.route_id} not found`);
    }

    const auditUserId = this.donationBoxAuditUserId(currentUser?.id);
    const before = this.donationBoxAuditSnapshot(donationBox);
    const previousShop = await this.buildShopPlacementSummary(donationBox);

    const auditPatch: Record<string, unknown> = {
      route_id: dto.route_id,
      city_id: dto.city_id ?? donationBox.city_id,
      shop_name: dto.shop_name.trim(),
      shopkeeper: dto.shopkeeper?.trim() || null,
      cell_no: dto.cell_no?.trim() || null,
      landmark_marketplace: dto.landmark_marketplace?.trim() || null,
      active_since:
        dto.active_since ||
        new Date().toISOString().slice(0, 10),
    };

    if (dto.registration_latitude != null && dto.registration_longitude != null) {
      auditPatch.registration_latitude = dto.registration_latitude;
      auditPatch.registration_longitude = dto.registration_longitude;
      if (dto.registration_location_details) {
        auditPatch.registration_location_details = dto.registration_location_details;
        auditPatch.registration_location_name =
          dto.registration_location_name ||
          dto.registration_location_details.display_name ||
          null;
      } else {
        const details = await reverseGeocodeLocationDetails(
          Number(dto.registration_latitude),
          Number(dto.registration_longitude),
        );
        auditPatch.registration_location_details = details;
        auditPatch.registration_location_name =
          dto.registration_location_name || details?.display_name || null;
      }
    }

    if (dto.assigned_user_ids !== undefined) {
      let assignedUsers: User[] = [];
      if (dto.assigned_user_ids.length > 0) {
        assignedUsers = await this.userRepository.findBy({
          id: In(dto.assigned_user_ids),
        });
        if (assignedUsers.length !== dto.assigned_user_ids.length) {
          throw new NotFoundException("One or more assigned users were not found");
        }
      }
      donationBox.assignedUsers = assignedUsers;
      auditPatch.assigned_user_ids = assignedUsers
        .map((u) => u.id)
        .sort((a, b) => a - b);
      await this.donationBoxRepository.save(donationBox);
    }

    const auditChanges = buildDonationBoxFieldChanges(before, auditPatch);
    const shopFieldsChanged = auditChanges.some((change) =>
      [
        "shop_name",
        "shopkeeper",
        "cell_no",
        "landmark_marketplace",
        "route_id",
        "city_id",
        "assigned_user_ids",
        "active_since",
        "registration_latitude",
        "registration_longitude",
        "registration_location_name",
        "registration_location_details",
      ].includes(change.field),
    );

    if (!shopFieldsChanged) {
      throw new BadRequestException(
        "No shop or placement changes detected. Update the new shop details before saving.",
      );
    }

    const scalarPatch = { ...auditPatch };
    if (auditUserId != null) {
      scalarPatch.updated_by = auditUserId;
    }

    await this.donationBoxRepository.update(id, scalarPatch as any);
    await this.refreshDonationBoxGeoSearch(id);

    const updated = await this.findOne(id);
    const newShop = await this.buildShopPlacementSummary(updated);

    const performer = auditUserId
      ? await this.userRepository.findOne({
          where: { id: auditUserId },
          select: ["id", "first_name", "last_name", "email", "manager_id"],
        })
      : null;

    await this.donationBoxAuditService.log({
      donationBoxId: id,
      action: DonationBoxAuditAction.SHOP_RELOCATED,
      source: DonationBoxAuditSource.STAFF_UI,
      changes: auditChanges,
      performedByUserId: auditUserId,
      metadata: {
        relocation_note: dto.relocation_note?.trim() || null,
        previous_shop: previousShop,
        new_shop: newShop,
        action: "donation_box_shop_relocated",
      },
    });

    await this.notifyManagerOnRelocation({
      donationBoxId: id,
      keyNo: updated.key_no,
      performer,
      previousShop,
      newShop,
      relocationNote: dto.relocation_note,
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
