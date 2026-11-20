import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "src/users/user.entity";
import {
  ReportingEdge,
  ReportingRelationship,
} from "./entities/reporting-edge.entity";
import { CreateReportingEdgeDto } from "./dto/create-reporting-edge.dto";
import { UpdateReportingEdgeDto } from "./dto/update-reporting-edge.dto";
import { SetUserManagersDto } from "./dto/set-user-managers.dto";

type UserSummary = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  department: string | null;
  role: string | null;
  display_name: string;
};

@Injectable()
export class ReportingHierarchyService {
  constructor(
    @InjectRepository(ReportingEdge)
    private readonly edgeRepo: Repository<ReportingEdge>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private displayName(u: Partial<User> | null | undefined): string {
    if (!u) return "—";
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    return full || u.email || `#${u.id}`;
  }

  private toUserSummary(u: User): UserSummary {
    return {
      id: u.id,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      email: u.email ?? null,
      department: (u.department as string) ?? null,
      role: (u.role as string) ?? null,
      display_name: this.displayName(u),
    };
  }

  private async requireActiveUser(id: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!user || user.isActive === false) {
      throw new NotFoundException(`User #${id} not found or inactive`);
    }
    return user;
  }

  /**
   * True if `managerId` appears in the reporting chain above `userId`
   * (would create a cycle if userId reported to managerId).
   */
  private async wouldCreateCycle(
    userId: number,
    managerId: number,
  ): Promise<boolean> {
    if (userId === managerId) return true;
    const visited = new Set<number>();
    let frontier = [managerId];
    while (frontier.length) {
      const next: number[] = [];
      const edges = await this.edgeRepo.find({
        where: {
          user_id: In(frontier),
          is_archived: false,
          is_active: true,
        },
        select: ["manager_id", "user_id"],
      });
      for (const e of edges) {
        if (e.manager_id === userId) return true;
        if (!visited.has(e.manager_id)) {
          visited.add(e.manager_id);
          next.push(e.manager_id);
        }
      }
      frontier = next;
    }
    return false;
  }

  private async assertNoCycle(userId: number, managerId: number) {
    if (await this.wouldCreateCycle(userId, managerId)) {
      throw new BadRequestException(
        "This assignment would create a circular reporting line",
      );
    }
  }

  async createEdge(
    dto: CreateReportingEdgeDto,
    actorId?: number | null,
  ): Promise<ReportingEdge> {
    const userId = Number(dto.user_id);
    const managerId = Number(dto.manager_id);
    if (!userId || !managerId) {
      throw new BadRequestException("user_id and manager_id are required");
    }
    if (userId === managerId) {
      throw new BadRequestException("A user cannot report to themselves");
    }

    const [user, manager] = await Promise.all([
      this.requireActiveUser(userId),
      this.requireActiveUser(managerId),
    ]);

    await this.assertNoCycle(userId, managerId);

    const relationship: ReportingRelationship =
      dto.relationship === "secondary" ? "secondary" : "primary";

    if (relationship === "primary") {
      await this.edgeRepo.update(
        {
          user_id: userId,
          relationship: "primary",
          is_archived: false,
          is_active: true,
        },
        { is_active: false },
      );
    }

    const existing = await this.edgeRepo.findOne({
      where: {
        user_id: userId,
        manager_id: managerId,
        relationship,
        is_archived: false,
      },
    });
    if (existing) {
      existing.is_active = true;
      existing.department =
        dto.department?.trim() ||
        (user.department as string) ||
        existing.department;
      existing.notes = dto.notes?.trim() || existing.notes;
      if (actorId && actorId > 0) {
        existing.updated_by = { id: actorId } as any;
      }
      return this.edgeRepo.save(existing);
    }

    const row = this.edgeRepo.create({
      user_id: userId,
      manager_id: managerId,
      relationship,
      department:
        dto.department?.trim() || (user.department as string) || null,
      notes: dto.notes?.trim() || null,
      is_active: true,
      is_archived: false,
      ...(actorId && actorId > 0
        ? {
            created_by: { id: actorId } as any,
            updated_by: { id: actorId } as any,
          }
        : {}),
    });
    return this.edgeRepo.save(row);
  }

  async updateEdge(
    id: number,
    dto: UpdateReportingEdgeDto,
    actorId?: number | null,
  ): Promise<ReportingEdge> {
    const row = await this.edgeRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) throw new NotFoundException(`Reporting edge #${id} not found`);

    const nextUserId =
      dto.user_id != null ? Number(dto.user_id) : row.user_id;
    const nextManagerId =
      dto.manager_id != null ? Number(dto.manager_id) : row.manager_id;
    if (nextUserId === nextManagerId) {
      throw new BadRequestException("A user cannot report to themselves");
    }
    await this.requireActiveUser(nextUserId);
    await this.requireActiveUser(nextManagerId);
    await this.assertNoCycle(nextUserId, nextManagerId);

    if (dto.relationship === "primary" || row.relationship === "primary") {
      const rel =
        dto.relationship === "secondary"
          ? "secondary"
          : dto.relationship === "primary"
            ? "primary"
            : row.relationship;
      if (rel === "primary") {
        await this.edgeRepo
          .createQueryBuilder()
          .update(ReportingEdge)
          .set({ is_active: false })
          .where("user_id = :uid", { uid: nextUserId })
          .andWhere("relationship = :rel", { rel: "primary" })
          .andWhere("is_archived = false")
          .andWhere("is_active = true")
          .andWhere("id != :id", { id })
          .execute();
      }
    }

    if (dto.user_id != null) row.user_id = nextUserId;
    if (dto.manager_id != null) row.manager_id = nextManagerId;
    if (dto.relationship != null) row.relationship = dto.relationship;
    if (dto.department !== undefined) {
      row.department = dto.department?.trim() || null;
    }
    if (dto.notes !== undefined) {
      row.notes = dto.notes?.trim() || null;
    }
    if (dto.is_active !== undefined) row.is_active = !!dto.is_active;
    if (actorId && actorId > 0) {
      row.updated_by = { id: actorId } as any;
    }
    return this.edgeRepo.save(row);
  }

  async archiveEdge(id: number, actorId?: number | null): Promise<void> {
    const row = await this.edgeRepo.findOne({
      where: { id, is_archived: false },
    });
    if (!row) throw new NotFoundException(`Reporting edge #${id} not found`);
    row.is_archived = true;
    row.is_active = false;
    if (actorId && actorId > 0) {
      row.updated_by = { id: actorId } as any;
    }
    await this.edgeRepo.save(row);
  }

  async findEdge(id: number): Promise<any> {
    const row = await this.edgeRepo.findOne({
      where: { id, is_archived: false },
      relations: ["user", "manager"],
    });
    if (!row) throw new NotFoundException(`Reporting edge #${id} not found`);
    return {
      ...row,
      user: row.user ? this.toUserSummary(row.user) : null,
      manager: row.manager ? this.toUserSummary(row.manager) : null,
    };
  }

  async listEdges(opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    user_id?: number;
    manager_id?: number;
    department?: string;
    relationship?: string;
    activeOnly?: boolean;
  }) {
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));

    const qb = this.edgeRepo
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.user", "u")
      .leftJoinAndSelect("e.manager", "m")
      .where("e.is_archived = false");

    if (opts.activeOnly !== false) {
      qb.andWhere("e.is_active = true");
    }
    if (opts.user_id) {
      qb.andWhere("e.user_id = :uid", { uid: opts.user_id });
    }
    if (opts.manager_id) {
      qb.andWhere("e.manager_id = :mid", { mid: opts.manager_id });
    }
    if (opts.department?.trim()) {
      qb.andWhere("LOWER(COALESCE(e.department, u.department, '')) = :dept", {
        dept: opts.department.trim().toLowerCase(),
      });
    }
    if (opts.relationship === "primary" || opts.relationship === "secondary") {
      qb.andWhere("e.relationship = :rel", { rel: opts.relationship });
    }
    if (opts.search?.trim()) {
      const s = `%${opts.search.trim()}%`;
      qb.andWhere(
        `(u.first_name ILIKE :s OR u.last_name ILIKE :s OR u.email ILIKE :s
          OR m.first_name ILIKE :s OR m.last_name ILIKE :s OR m.email ILIKE :s)`,
        { s },
      );
    }

    qb.orderBy("e.updated_at", "DESC");
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        manager_id: r.manager_id,
        relationship: r.relationship,
        department: r.department,
        is_active: r.is_active,
        notes: r.notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: r.user ? this.toUserSummary(r.user) : null,
        manager: r.manager ? this.toUserSummary(r.manager) : null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  /** Active users with primary manager from this module (not users.manager_id). */
  async listPeople(opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    department?: string;
  }) {
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));

    const qb = this.userRepo
      .createQueryBuilder("u")
      .where("u.is_archived = false")
      .andWhere("u.isActive = true");

    if (opts.department?.trim()) {
      qb.andWhere("u.department = :dept", { dept: opts.department.trim() });
    }
    if (opts.search?.trim()) {
      const s = `%${opts.search.trim()}%`;
      qb.andWhere(
        `(u.first_name ILIKE :s OR u.last_name ILIKE :s OR u.email ILIKE :s OR CAST(u.id AS TEXT) ILIKE :s)`,
        { s },
      );
    }
    qb.orderBy("u.first_name", "ASC").addOrderBy("u.last_name", "ASC");

    const total = await qb.getCount();
    const users = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const userIds = users.map((u) => u.id);
    const edges =
      userIds.length === 0
        ? []
        : await this.edgeRepo.find({
            where: {
              user_id: In(userIds),
              is_archived: false,
              is_active: true,
            },
            relations: ["manager"],
          });

    const byUser = new Map<number, ReportingEdge[]>();
    for (const e of edges) {
      const list = byUser.get(e.user_id) || [];
      list.push(e);
      byUser.set(e.user_id, list);
    }

    const items = users.map((u) => {
      const list = byUser.get(u.id) || [];
      const primary = list.find((e) => e.relationship === "primary");
      const secondaries = list.filter((e) => e.relationship === "secondary");
      return {
        ...this.toUserSummary(u),
        primary_manager: primary?.manager
          ? this.toUserSummary(primary.manager)
          : null,
        secondary_managers: secondaries
          .map((e) => (e.manager ? this.toUserSummary(e.manager) : null))
          .filter(Boolean),
        edge_count: list.length,
      };
    });

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async getDirectReportIds(managerId: number): Promise<number[]> {
    const rows = await this.edgeRepo.find({
      where: {
        manager_id: managerId,
        is_archived: false,
        is_active: true,
      },
      select: ["user_id"],
    });
    return [...new Set(rows.map((r) => r.user_id))];
  }

  async getAllReportIds(managerId: number): Promise<number[]> {
    const all: number[] = [];
    const seen = new Set<number>([managerId]);
    let frontier = [managerId];
    while (frontier.length) {
      const rows = await this.edgeRepo.find({
        where: {
          manager_id: In(frontier),
          is_archived: false,
          is_active: true,
        },
        select: ["user_id"],
      });
      frontier = [];
      for (const r of rows) {
        if (seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        all.push(r.user_id);
        frontier.push(r.user_id);
      }
    }
    return all;
  }

  async getUserHierarchy(userId: number) {
    const user = await this.requireActiveUser(userId);
    const edges = await this.edgeRepo.find({
      where: { user_id: userId, is_archived: false, is_active: true },
      relations: ["manager"],
    });
    const primary = edges.find((e) => e.relationship === "primary");
    const secondaries = edges.filter((e) => e.relationship === "secondary");

    const directIds = await this.getDirectReportIds(userId);
    const allIds = await this.getAllReportIds(userId);

    const reportUsers =
      allIds.length === 0
        ? []
        : await this.userRepo.find({
            where: { id: In(allIds), is_archived: false },
          });
    const byId = new Map(reportUsers.map((u) => [u.id, u]));

    return {
      user: this.toUserSummary(user),
      primary_manager: primary?.manager
        ? this.toUserSummary(primary.manager)
        : null,
      secondary_managers: secondaries
        .map((e) => (e.manager ? this.toUserSummary(e.manager) : null))
        .filter(Boolean),
      edges: edges.map((e) => ({
        id: e.id,
        manager_id: e.manager_id,
        relationship: e.relationship,
        department: e.department,
        notes: e.notes,
        manager: e.manager ? this.toUserSummary(e.manager) : null,
      })),
      direct_reports: directIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((u) => this.toUserSummary(u!)),
      all_reports: allIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((u) => this.toUserSummary(u!)),
      note: "Standalone module data only — does not change users.manager_id / user_managers used by existing APIs.",
    };
  }

  /** Replace primary + secondary managers for a user (module-local only). */
  async setUserManagers(
    userId: number,
    dto: SetUserManagersDto,
    actorId?: number | null,
  ) {
    const user = await this.requireActiveUser(userId);
    const primaryId =
      dto.primary_manager_id == null || dto.primary_manager_id === undefined
        ? null
        : Number(dto.primary_manager_id);
    const secondaryIds = [
      ...new Set(
        (dto.secondary_manager_ids || [])
          .map((id) => Number(id))
          .filter((id) => id > 0 && id !== userId && id !== primaryId),
      ),
    ];

    if (primaryId != null) {
      await this.requireActiveUser(primaryId);
      await this.assertNoCycle(userId, primaryId);
    }
    for (const mid of secondaryIds) {
      await this.requireActiveUser(mid);
      await this.assertNoCycle(userId, mid);
    }

    // Deactivate existing active edges for this user
    await this.edgeRepo.update(
      { user_id: userId, is_archived: false, is_active: true },
      { is_active: false },
    );

    if (primaryId != null) {
      await this.createEdge(
        {
          user_id: userId,
          manager_id: primaryId,
          relationship: "primary",
          department:
            dto.department?.trim() || (user.department as string) || null,
          notes: dto.notes?.trim() || null,
        },
        actorId,
      );
    }
    for (const mid of secondaryIds) {
      await this.createEdge(
        {
          user_id: userId,
          manager_id: mid,
          relationship: "secondary",
          department:
            dto.department?.trim() || (user.department as string) || null,
          notes: dto.notes?.trim() || null,
        },
        actorId,
      );
    }

    return this.getUserHierarchy(userId);
  }

  /**
   * Full organogram forest from reporting_edges (primary by default).
   * Does not use users.manager_id.
   */
  async getOrganogram(opts?: {
    department?: string;
    /** primary = solid reporting line only (default); all = include secondary */
    mode?: "primary" | "all";
    root_user_id?: number;
  }) {
    const mode = opts?.mode === "all" ? "all" : "primary";
    const qb = this.edgeRepo
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.user", "u")
      .leftJoinAndSelect("e.manager", "m")
      .where("e.is_archived = false")
      .andWhere("e.is_active = true");

    if (mode === "primary") {
      qb.andWhere("e.relationship = :rel", { rel: "primary" });
    }
    if (opts?.department?.trim()) {
      qb.andWhere(
        "LOWER(COALESCE(e.department, u.department, m.department, '')) = :dept",
        { dept: opts.department.trim().toLowerCase() },
      );
    }

    const edges = await qb.getMany();

    const childrenMap = new Map<number, number[]>();
    const childHasParent = new Set<number>();
    const userMap = new Map<number, UserSummary>();

    for (const e of edges) {
      if (e.user) userMap.set(e.user.id, this.toUserSummary(e.user));
      if (e.manager) userMap.set(e.manager.id, this.toUserSummary(e.manager));
      childHasParent.add(e.user_id);
      const list = childrenMap.get(e.manager_id) || [];
      if (!list.includes(e.user_id)) list.push(e.user_id);
      childrenMap.set(e.manager_id, list);
    }

    type OrgNode = UserSummary & {
      children: OrgNode[];
      level: number;
    };

    const build = (id: number, level: number, stack: Set<number>): OrgNode => {
      const summary = userMap.get(id) || {
        id,
        first_name: null,
        last_name: null,
        email: null,
        department: null,
        role: null,
        display_name: `#${id}`,
      };
      if (stack.has(id)) {
        return { ...summary, children: [], level };
      }
      const nextStack = new Set(stack);
      nextStack.add(id);
      const childIds = childrenMap.get(id) || [];
      return {
        ...summary,
        level,
        children: childIds.map((cid) => build(cid, level + 1, nextStack)),
      };
    };

    let rootIds: number[] = [];
    if (opts?.root_user_id) {
      rootIds = [Number(opts.root_user_id)];
    } else {
      // Roots = managers who are not anyone's child in this edge set
      const managerIds = [...childrenMap.keys()];
      rootIds = managerIds.filter((id) => !childHasParent.has(id));
      // Also surface employees with no manager and no reports as isolated roots
      // (optional — skip to keep chart clean; only show trees with structure)
    }

    const trees = rootIds.map((id) => build(id, 0, new Set()));

    return {
      mode,
      department: opts?.department?.trim() || null,
      edge_count: edges.length,
      tree_count: trees.length,
      trees,
      note: "Built from reporting_edges only — legacy user.manager_id not used.",
    };
  }

  /** Canonical columns for department fill-in sheets. */
  static readonly IMPORT_HEADERS = [
    "employee_email",
    "manager_email",
    "relationship",
    "department",
    "notes",
    "employee_name",
    "manager_name",
  ] as const;

  getImportTemplateMeta() {
    return {
      filename: "reporting_hierarchy_template.xlsx",
      headers: [...ReportingHierarchyService.IMPORT_HEADERS],
      required: ["employee_email", "manager_email"],
      optional: [
        "relationship",
        "department",
        "notes",
        "employee_name",
        "manager_name",
      ],
      rules: [
        "One row = one reporting link (employee reports to manager).",
        "Match people by work email (must already exist in ERP).",
        "employee_name / manager_name are optional labels for the sheet only.",
        "relationship: primary (default) or secondary.",
        "department: optional; e.g. hr, it, program, fund_raising.",
        "Do not invent emails — use exact ERP login emails.",
        "Top of org: leave that person out as an employee row (they only appear as manager).",
      ],
      example_rows: [
        {
          employee_email: "alice@example.com",
          manager_email: "bob@example.com",
          relationship: "primary",
          department: "hr",
          notes: "",
          employee_name: "Alice Khan",
          manager_name: "Bob Ahmed",
        },
        {
          employee_email: "carol@example.com",
          manager_email: "bob@example.com",
          relationship: "primary",
          department: "hr",
          notes: "",
          employee_name: "Carol Ali",
          manager_name: "Bob Ahmed",
        },
      ],
    };
  }

  /** Build .xlsx buffer: Instructions + Hierarchy sheets. */
  buildImportTemplateBuffer(): Buffer {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const meta = this.getImportTemplateMeta();
    const wb = XLSX.utils.book_new();

    const instructionRows = [
      ["Reporting Hierarchy — Department fill-in sheet"],
      [""],
      ["How to use"],
      ["1. Open the Hierarchy sheet."],
      ["2. Fill one row per employee → manager link."],
      ["3. Use exact ERP work emails (employee_email, manager_email)."],
      ["4. relationship = primary (main manager) or secondary."],
      ["5. employee_name / manager_name are optional (for your readability)."],
      ["6. Save and send this file back for upload into ERP."],
      [""],
      ["Required columns"],
      ["employee_email", "Work email of the person who reports"],
      ["manager_email", "Work email of their manager"],
      [""],
      ["Optional columns"],
      ["relationship", "primary (default) | secondary"],
      ["department", "e.g. hr, it, program, fund_raising"],
      ["notes", "Any comment"],
      ["employee_name", "Display name (ignored on import)"],
      ["manager_name", "Display name (ignored on import)"],
      [""],
      ["Rules"],
      ...meta.rules.map((r) => [r]),
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructionRows);
    wsInfo["!cols"] = [{ wch: 28 }, { wch: 56 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

    const header = [...ReportingHierarchyService.IMPORT_HEADERS];
    const dataRows = meta.example_rows.map((r) =>
      header.map((h) => (r as any)[h] ?? ""),
    );
    const wsData = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    wsData["!cols"] = header.map((h) => ({
      wch: Math.max(14, h.length + 2),
    }));
    XLSX.utils.book_append_sheet(wb, wsData, "Hierarchy");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  private normalizeHeader(h: string): string {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  private parseImportWorkbook(file: {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
  }): Record<string, string>[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const name = (file.originalname || "").toLowerCase();
    const isCsv =
      name.endsWith(".csv") ||
      (file.mimetype || "").includes("csv") ||
      (file.mimetype || "").includes("text/plain");

    const wb = XLSX.read(file.buffer, {
      type: "buffer",
      raw: false,
      codepage: 65001,
    });

    let sheetName = wb.SheetNames.find(
      (n: string) => n.toLowerCase() === "hierarchy",
    );
    if (!sheetName) {
      sheetName =
        wb.SheetNames.find(
          (n: string) => n.toLowerCase() !== "instructions",
        ) || wb.SheetNames[0];
    }
    if (!sheetName) {
      throw new BadRequestException("Workbook has no sheets");
    }

    const sheet = wb.Sheets[sheetName];
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });
    if (!aoa.length) {
      throw new BadRequestException("Sheet is empty");
    }

    const headers = aoa[0].map((h) => this.normalizeHeader(String(h)));
    const emailIdx = headers.indexOf("employee_email");
    const mgrIdx = headers.indexOf("manager_email");
    if (emailIdx < 0 || mgrIdx < 0) {
      throw new BadRequestException(
        `Missing required columns. Need employee_email and manager_email. Found: ${headers.join(", ") || "(none)"}${isCsv ? "" : ` (sheet: ${sheetName})`}`,
      );
    }

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i] || [];
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        obj[h] = String(line[idx] ?? "").trim();
      });
      if (!obj.employee_email && !obj.manager_email) continue;
      rows.push(obj);
    }
    return rows;
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    return this.userRepo
      .createQueryBuilder("u")
      .where("LOWER(u.email) = :e", { e })
      .andWhere("u.is_archived = false")
      .getOne();
  }

  /**
   * Import hierarchy rows from CSV/XLSX.
   * dryRun=true validates and reports without writing.
   */
  async importHierarchyFile(
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    opts: { dryRun?: boolean; actorId?: number | null } = {},
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("No file uploaded");
    }
    const rows = this.parseImportWorkbook(file);
    if (!rows.length) {
      throw new BadRequestException("No data rows found in file");
    }

    const dryRun = !!opts.dryRun;
    const results: Array<{
      row: number;
      employee_email: string;
      manager_email: string;
      relationship: string;
      status: "created" | "updated" | "ok" | "error" | "skipped";
      message: string;
      employee_id?: number;
      manager_id?: number;
    }> = [];

    let created = 0;
    let updated = 0;
    let errors = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // 1-based + header
      const employeeEmail = (r.employee_email || "").trim();
      const managerEmail = (r.manager_email || "").trim();
      let relationship = (r.relationship || "primary").trim().toLowerCase();
      if (!relationship) relationship = "primary";

      const base = {
        row: rowNum,
        employee_email: employeeEmail,
        manager_email: managerEmail,
        relationship,
      };

      if (!employeeEmail || !managerEmail) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: "employee_email and manager_email are required",
        });
        continue;
      }
      if (relationship !== "primary" && relationship !== "secondary") {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: 'relationship must be "primary" or "secondary"',
        });
        continue;
      }
      if (employeeEmail.toLowerCase() === managerEmail.toLowerCase()) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: "Employee cannot report to themselves",
        });
        continue;
      }

      const [employee, manager] = await Promise.all([
        this.findUserByEmail(employeeEmail),
        this.findUserByEmail(managerEmail),
      ]);

      if (!employee) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: `Employee email not found in ERP: ${employeeEmail}`,
        });
        continue;
      }
      if (employee.isActive === false) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: `Employee is inactive: ${employeeEmail}`,
          employee_id: employee.id,
        });
        continue;
      }
      if (!manager) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: `Manager email not found in ERP: ${managerEmail}`,
          employee_id: employee.id,
        });
        continue;
      }
      if (manager.isActive === false) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: `Manager is inactive: ${managerEmail}`,
          employee_id: employee.id,
          manager_id: manager.id,
        });
        continue;
      }

      try {
        if (await this.wouldCreateCycle(employee.id, manager.id)) {
          errors++;
          results.push({
            ...base,
            status: "error",
            message: "Would create a circular reporting line",
            employee_id: employee.id,
            manager_id: manager.id,
          });
          continue;
        }

        if (dryRun) {
          skipped++;
          results.push({
            ...base,
            status: "ok",
            message: "Valid — ready to import",
            employee_id: employee.id,
            manager_id: manager.id,
          });
          continue;
        }

        const existing = await this.edgeRepo.findOne({
          where: {
            user_id: employee.id,
            manager_id: manager.id,
            relationship: relationship as ReportingRelationship,
            is_archived: false,
          },
        });

        await this.createEdge(
          {
            user_id: employee.id,
            manager_id: manager.id,
            relationship: relationship as "primary" | "secondary",
            department: r.department?.trim() || null,
            notes: r.notes?.trim() || null,
          },
          opts.actorId,
        );

        if (existing) {
          updated++;
          results.push({
            ...base,
            status: "updated",
            message: "Edge reactivated / updated",
            employee_id: employee.id,
            manager_id: manager.id,
          });
        } else {
          created++;
          results.push({
            ...base,
            status: "created",
            message: "Edge created",
            employee_id: employee.id,
            manager_id: manager.id,
          });
        }
      } catch (err: any) {
        errors++;
        results.push({
          ...base,
          status: "error",
          message: err?.message || "Failed to import row",
          employee_id: employee.id,
          manager_id: manager.id,
        });
      }
    }

    return {
      dry_run: dryRun,
      total_rows: rows.length,
      created,
      updated,
      valid: dryRun ? skipped : created + updated,
      errors,
      results,
      note: "Matched by email against ERP users. Does not change users.manager_id.",
    };
  }
}
