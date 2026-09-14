import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Brackets, In } from "typeorm";
import {
  Complaint,
  ComplaintKind,
  ComplaintScope,
  ComplaintStatus,
  ComplaintType,
  ComplaintWorkflowStatus,
  ComplaintCategory,
} from "./entities/complaint.entity";
import {
  ComplaintMeeting,
  ComplaintMeetingStatus,
} from "./entities/complaint-meeting.entity";
import {
  ComplaintInvestigationLog,
  ComplaintInvestigationAction,
} from "./entities/complaint-investigation-log.entity";
import { ComplaintActivity } from "./entities/complaint-activity.entity";
import { CreateGeneralComplaintDto } from "./dto/create-general-complaint.dto";
import { UpdateComplaintCaseDto } from "./dto/update-complaint-case.dto";
import { ManageComplaintNomineesDto } from "./dto/manage-complaint-nominees.dto";
import { UpdateComplaintWorkflowStatusDto } from "./dto/update-complaint-workflow-status.dto";
import { UpdateComplaintNarrativesDto } from "./dto/update-complaint-narratives.dto";
import { CreateComplaintMeetingDto } from "./dto/create-complaint-meeting.dto";
import { UpdateComplaintMeetingDto } from "./dto/update-complaint-meeting.dto";
import { AddInvestigationLogDto } from "./dto/add-investigation-log.dto";
import { User, UserRole } from "../users/user.entity";
import { PermissionsService } from "../permissions/permissions.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/entities/notification.entity";
import { generateComplaintCode } from "./utils/complaint-code.util";

@Injectable()
export class ComplaintCaseService {
  private readonly logger = new Logger(ComplaintCaseService.name);

  constructor(
    @InjectRepository(Complaint)
    private readonly complaintRepo: Repository<Complaint>,
    @InjectRepository(ComplaintMeeting)
    private readonly meetingRepo: Repository<ComplaintMeeting>,
    @InjectRepository(ComplaintInvestigationLog)
    private readonly investigationLogRepo: Repository<ComplaintInvestigationLog>,
    @InjectRepository(ComplaintActivity)
    private readonly activityRepo: Repository<ComplaintActivity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly permissionsService: PermissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private normalizeIds(ids?: number[] | null): number[] {
    return [
      ...new Set(
        (ids || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
  }

  private isAdmin(user: User): boolean {
    const role = String(user?.role || "").toLowerCase();
    return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
  }

  private checkAction(
    permissions: Record<string, any>,
    path: string,
  ): boolean {
    const parts = path.split(".");
    let current: any = permissions;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!current || typeof current !== "object") return false;
      current = current[parts[i]];
    }
    const action = parts[parts.length - 1];
    return current?.[action] === true;
  }

  private hasAnyAction(
    permissions: Record<string, any>,
    paths: string[],
  ): boolean {
    return paths.some((path) => this.checkAction(permissions, path));
  }

  private async getCasePermissions(user: User) {
    if (this.isAdmin(user)) {
      return {
        canList: true,
        canView: true,
        canCreate: true,
        canInvestigate: true,
        canUpdateStatus: true,
        canManageNominees: true,
        canViewNominees: true,
        canScheduleMeetings: true,
        canAddNarrative: true,
      };
    }

    const permissions = await this.permissionsService.getUserPermissions(
      Number(user.id),
    );
    if (permissions?.super_admin === true) {
      return {
        canList: true,
        canView: true,
        canCreate: true,
        canInvestigate: true,
        canUpdateStatus: true,
        canManageNominees: true,
        canViewNominees: true,
        canScheduleMeetings: true,
        canAddNarrative: true,
      };
    }

    const deptKey =
      user.department &&
      (permissions?.[user.department]?.tickets ||
        permissions?.[user.department]?.complaints)
        ? user.department
        : null;
    const moduleRoot =
      (deptKey ? permissions?.[deptKey]?.tickets : null) ||
      permissions?.tickets ||
      {};
    const casePerms =
      moduleRoot?.complaints_case ||
      permissions?.tickets?.complaints_case ||
      permissions?.complaints_case ||
      {};

    const has = (action: string, fallbacks: string[] = []) =>
      casePerms[action] === true ||
      this.hasAnyAction(permissions, fallbacks);

    return {
      canList: has("list_view", [
        "tickets.complaints_case.list_view",
        "tickets.complaints_case.view",
      ]),
      canView: has("view", ["tickets.complaints_case.view"]),
      canCreate: has("create", ["tickets.complaints_case.create"]),
      canInvestigate: has("investigate", [
        "tickets.complaints_case.investigate",
      ]),
      canUpdateStatus: has("update_status", [
        "tickets.complaints_case.update_status",
        "tickets.complaints_case.investigate",
      ]),
      canManageNominees: has("manage_nominees", [
        "tickets.complaints_case.manage_nominees",
        "tickets.complaints_case.investigate",
      ]),
      canViewNominees: has("view_nominees", [
        "tickets.complaints_case.view_nominees",
        "tickets.complaints_case.view",
      ]),
      canScheduleMeetings: has("schedule_meetings", [
        "tickets.complaints_case.schedule_meetings",
        "tickets.complaints_case.investigate",
      ]),
      canAddNarrative: has("add_narrative", [
        "tickets.complaints_case.add_narrative",
        "tickets.complaints_case.investigate",
      ]),
    };
  }

  private assertCaseRecord(complaint: Complaint | null): Complaint {
    if (!complaint) {
      throw new NotFoundException("Complaint not found");
    }
    if (complaint.type !== ComplaintKind.COMPLAINT) {
      throw new BadRequestException("This record is not a grievance complaint");
    }
    if (!complaint.complaint_workflow_status) {
      throw new BadRequestException(
        "This record does not use the grievance workflow",
      );
    }
    return complaint;
  }

  private isStakeholder(user: User, complaint: Complaint): boolean {
    const uid = Number(user.id);
    if (complaint.created_by_id === uid) return true;
    if (complaint.reported_by_id === uid) return true;
    if (this.normalizeIds(complaint.nominated_user_ids).includes(uid))
      return true;
    if (this.normalizeIds(complaint.investigator_ids).includes(uid))
      return true;
    return false;
  }

  private async assertCanView(user: User, complaint: Complaint): Promise<void> {
    const perms = await this.getCasePermissions(user);
    if (perms.canView || this.isStakeholder(user, complaint)) return;
    throw new ForbiddenException("You do not have permission to view this complaint");
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateComplaintCode();
      const existing = await this.complaintRepo.findOne({
        where: { complaint_code: code },
        select: ["id"],
      });
      if (!existing) return code;
    }
    throw new BadRequestException("Unable to generate complaint reference code");
  }

  private async logInvestigation(
    complaintId: number,
    user: User | null,
    action: ComplaintInvestigationAction,
    remarks: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.investigationLogRepo.save(
      this.investigationLogRepo.create({
        complaint_id: complaintId,
        action,
        remarks,
        metadata: metadata || null,
        performed_by_id: user?.id ?? null,
      }),
    );
  }

  private async logActivity(
    complaint: Complaint,
    user: User | null,
    action: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.activityRepo.save(
      this.activityRepo.create({
        complaint,
        action,
        title: complaint.title,
        details: details || {},
        performed_by: user || null,
      }),
    );
  }

  private async notifyUsers(
    complaint: Complaint,
    userIds: number[],
    title: string,
    message: string,
    event: string,
    actor?: User,
  ): Promise<void> {
    const recipients = this.normalizeIds(userIds);
    if (!recipients.length) return;
    try {
      await this.notificationsService.create(
        {
          title,
          message,
          type: NotificationType.TASK,
          link: `/complaints/view/${complaint.id}`,
          metadata: {
            complaint_id: complaint.id,
            complaint_code: complaint.complaint_code,
            event,
          },
        },
        recipients,
        actor,
      );
    } catch (err: any) {
      this.logger.warn(`Notification failed (${event}): ${err?.message}`);
    }
  }

  async create(dto: CreateGeneralComplaintDto, user: User): Promise<Complaint> {
    const perms = await this.getCasePermissions(user);
    if (!perms.canCreate) {
      throw new ForbiddenException("You do not have permission to create complaints");
    }

    if (
      dto.complaint_category === ComplaintCategory.OTHER &&
      !dto.complaint_category_custom?.trim()
    ) {
      throw new BadRequestException(
        "Custom category is required when category is Other",
      );
    }

    if (!dto.nominated_departments?.length) {
      throw new BadRequestException("At least one nominated department is required");
    }

    if (dto.related_issue_id) {
      const related = await this.complaintRepo.findOne({
        where: { id: dto.related_issue_id, type: ComplaintKind.ISSUE },
      });
      if (!related) {
        throw new BadRequestException("Related issue not found");
      }
    }

    const code = await this.generateUniqueCode();
    const nominatedUsers = this.normalizeIds(dto.nominated_user_ids);

    const complaint = this.complaintRepo.create({
      title: dto.title.trim(),
      description: dto.description?.trim() || "",
      complainer_narrative:
        dto.complainer_narrative?.trim() || dto.description?.trim() || "",
      department: dto.department,
      type: ComplaintKind.COMPLAINT,
      scope: dto.scope || ComplaintScope.INTERNAL,
      complaint_type: ComplaintType.ONE_TIME,
      status: ComplaintStatus.OPEN,
      complaint_workflow_status: ComplaintWorkflowStatus.SUBMITTED,
      complaint_code: code,
      complaint_category: dto.complaint_category,
      complaint_category_custom:
        dto.complaint_category === ComplaintCategory.OTHER
          ? dto.complaint_category_custom?.trim() || null
          : null,
      nominated_departments: dto.nominated_departments,
      nominated_user_ids: nominatedUsers.length ? nominatedUsers : null,
      related_issue_id: dto.related_issue_id || null,
      project_name: dto.project_name?.trim() || null,
      submission_channel: dto.submission_channel || "internal",
      created_by_id: user.id,
      reported_by_id: user.id,
    });

    const saved = await this.complaintRepo.save(complaint);
    await this.logActivity(saved, user, "complaint_submitted", {
      complaint_code: code,
      category: dto.complaint_category,
    });
    await this.logInvestigation(
      saved.id,
      user,
      ComplaintInvestigationAction.STATUS_CHANGE,
      "Complaint submitted",
      { status: ComplaintWorkflowStatus.SUBMITTED },
    );

    if (nominatedUsers.length) {
      await this.notifyUsers(
        saved,
        nominatedUsers,
        "Complaint nomination",
        `You have been nominated in complaint ${code}: ${saved.title}`,
        "nominee_added",
        user,
      );
    }

    return this.findOne(saved.id, user);
  }

  async findAll(payload: any, user: User) {
    const perms = await this.getCasePermissions(user);
    const restrictToStakeholder = !perms.canList && !this.isAdmin(user);

    const page = Number(payload?.pagination?.page) || 1;
    const pageSize = Number(payload?.pagination?.pageSize) || 10;
    const sortField = payload?.pagination?.sortField || "created_at";
    const sortOrder =
      String(payload?.pagination?.sortOrder || "DESC").toUpperCase() === "ASC"
        ? "ASC"
        : "DESC";
    const filters = payload?.filters || {};

    const qb = this.complaintRepo
      .createQueryBuilder("c")
      .where("c.type = :kind", { kind: ComplaintKind.COMPLAINT })
      .andWhere("c.complaint_workflow_status IS NOT NULL");

    if (restrictToStakeholder) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("c.created_by_id = :uid", { uid: user.id })
            .orWhere("c.reported_by_id = :uid", { uid: user.id })
            .orWhere(":uid = ANY(c.nominated_user_ids)", { uid: user.id })
            .orWhere(":uid = ANY(c.investigator_ids)", { uid: user.id });
        }),
      );
    }

    if (filters.complaint_workflow_status) {
      qb.andWhere("c.complaint_workflow_status = :ws", {
        ws: filters.complaint_workflow_status,
      });
    }
    if (filters.complaint_category) {
      qb.andWhere("c.complaint_category = :cat", {
        cat: filters.complaint_category,
      });
    }
    if (filters.department) {
      qb.andWhere(":dept = ANY(c.nominated_departments)", {
        dept: filters.department,
      });
    }
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("c.title ILIKE :term", { term })
            .orWhere("c.description ILIKE :term", { term })
            .orWhere("c.complaint_code ILIKE :term", { term });
        }),
      );
    }

    const allowedSort = new Set([
      "created_at",
      "updated_at",
      "title",
      "complaint_workflow_status",
      "complaint_category",
    ]);
    const orderField = allowedSort.has(sortField) ? sortField : "created_at";
    qb.orderBy(`c.${orderField}`, sortOrder as "ASC" | "DESC");

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(ComplaintWorkflowStatus)) {
      const countQb = this.complaintRepo
        .createQueryBuilder("c")
        .where("c.type = :kind", { kind: ComplaintKind.COMPLAINT })
        .andWhere("c.complaint_workflow_status = :status", { status });
      if (restrictToStakeholder) {
        countQb.andWhere(
          new Brackets((sub) => {
            sub
              .where("c.created_by_id = :uid", { uid: user.id })
              .orWhere("c.reported_by_id = :uid", { uid: user.id })
              .orWhere(":uid = ANY(c.nominated_user_ids)", { uid: user.id })
              .orWhere(":uid = ANY(c.investigator_ids)", { uid: user.id });
          }),
        );
      }
      statusCounts[status] = await countQb.getCount();
    }

    return {
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      statusCounts,
    };
  }

  async findOne(id: number, user: User): Promise<Complaint> {
    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
      relations: ["attachments", "comments", "comments.author", "created_by"],
    });
    this.assertCaseRecord(complaint);
    await this.assertCanView(user, complaint!);

    const meetings = await this.meetingRepo.find({
      where: { complaint_id: id },
      order: { scheduled_at: "DESC" },
    });
    const investigationLogs = await this.investigationLogRepo.find({
      where: { complaint_id: id },
      relations: ["performed_by"],
      order: { created_at: "DESC" },
    });

    let relatedIssue = null;
    if (complaint!.related_issue_id) {
      relatedIssue = await this.complaintRepo.findOne({
        where: { id: complaint!.related_issue_id, type: ComplaintKind.ISSUE },
        select: ["id", "title", "status", "department"],
      });
    }

    const perms = await this.getCasePermissions(user);
    const result: any = {
      ...complaint,
      meetings,
      investigation_logs: investigationLogs,
      related_issue: relatedIssue,
      permissions: {
        ...perms,
        isStakeholder: this.isStakeholder(user, complaint!),
      },
    };

    if (!perms.canViewNominees && !this.isStakeholder(user, complaint!)) {
      result.nominated_departments = [];
      result.nominated_user_ids = [];
      result.investigator_ids = [];
    }

    return result;
  }

  async updateCase(
    id: number,
    dto: UpdateComplaintCaseDto,
    user: User,
  ): Promise<Complaint> {
    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);
    await this.assertCanView(user, complaint!);

    const perms = await this.getCasePermissions(user);
    if (
      !perms.canInvestigate &&
      complaint!.created_by_id !== user.id &&
      !this.isAdmin(user)
    ) {
      throw new ForbiddenException("You cannot update this complaint");
    }

    Object.assign(complaint!, {
      ...(dto.title != null ? { title: dto.title.trim() } : {}),
      ...(dto.description != null ? { description: dto.description.trim() } : {}),
      ...(dto.complaint_category != null
        ? { complaint_category: dto.complaint_category }
        : {}),
      ...(dto.complaint_category_custom != null
        ? { complaint_category_custom: dto.complaint_category_custom.trim() }
        : {}),
      ...(dto.project_name != null ? { project_name: dto.project_name.trim() } : {}),
      ...(dto.related_issue_id != null
        ? { related_issue_id: dto.related_issue_id }
        : {}),
      updated_by_id: user.id,
    });

    await this.complaintRepo.save(complaint!);
    await this.logActivity(complaint!, user, "complaint_updated");
    return this.findOne(id, user);
  }

  async updateWorkflowStatus(
    id: number,
    dto: UpdateComplaintWorkflowStatusDto,
    user: User,
  ): Promise<Complaint> {
    const perms = await this.getCasePermissions(user);
    if (!perms.canUpdateStatus) {
      throw new ForbiddenException("You do not have permission to update complaint status");
    }

    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);

    const previous = complaint!.complaint_workflow_status;
    complaint!.complaint_workflow_status = dto.status;
    if (dto.resolution_summary) {
      complaint!.resolution_summary = dto.resolution_summary.trim();
    }
    complaint!.updated_by_id = user.id;

    if (
      dto.status === ComplaintWorkflowStatus.RESOLVED ||
      dto.status === ComplaintWorkflowStatus.CLOSED
    ) {
      complaint!.status = ComplaintStatus.CLOSED;
      complaint!.completed_date = new Date();
    } else if (dto.status === ComplaintWorkflowStatus.UNDER_INVESTIGATION) {
      complaint!.status = ComplaintStatus.IN_PROGRESS;
    }

    await this.complaintRepo.save(complaint!);
    await this.logInvestigation(
      id,
      user,
      ComplaintInvestigationAction.STATUS_CHANGE,
      dto.remarks || `Status changed to ${dto.status}`,
      { from: previous, to: dto.status },
    );

    const notifyIds = this.normalizeIds([
      complaint!.created_by_id,
      ...(complaint!.nominated_user_ids || []),
      ...(complaint!.investigator_ids || []),
    ]);
    await this.notifyUsers(
      complaint!,
      notifyIds,
      "Complaint status updated",
      `Complaint ${complaint!.complaint_code} is now ${dto.status.replace(/_/g, " ")}`,
      "status_change",
      user,
    );

    return this.findOne(id, user);
  }

  async manageNominees(
    id: number,
    dto: ManageComplaintNomineesDto,
    user: User,
  ): Promise<Complaint> {
    const perms = await this.getCasePermissions(user);
    if (!perms.canManageNominees) {
      throw new ForbiddenException("You do not have permission to manage nominees");
    }

    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);

    const previousUsers = this.normalizeIds(complaint!.nominated_user_ids);
    if (dto.nominated_departments != null) {
      if (!dto.nominated_departments.length) {
        throw new BadRequestException("At least one nominated department is required");
      }
      complaint!.nominated_departments = dto.nominated_departments;
    }
    if (dto.nominated_user_ids != null) {
      complaint!.nominated_user_ids = this.normalizeIds(dto.nominated_user_ids);
    }
    if (dto.investigator_ids != null) {
      complaint!.investigator_ids = this.normalizeIds(dto.investigator_ids);
    }
    complaint!.updated_by_id = user.id;
    await this.complaintRepo.save(complaint!);

    const newUsers = this.normalizeIds(complaint!.nominated_user_ids).filter(
      (uid) => !previousUsers.includes(uid),
    );
    if (newUsers.length) {
      await this.notifyUsers(
        complaint!,
        newUsers,
        "Complaint nomination",
        `You have been nominated in complaint ${complaint!.complaint_code}`,
        "nominee_added",
        user,
      );
    }

    await this.logInvestigation(
      id,
      user,
      ComplaintInvestigationAction.NOMINEE_UPDATE,
      "Nominees updated",
      {
        nominated_departments: complaint!.nominated_departments,
        nominated_user_ids: complaint!.nominated_user_ids,
        investigator_ids: complaint!.investigator_ids,
      },
    );

    return this.findOne(id, user);
  }

  async updateNarratives(
    id: number,
    dto: UpdateComplaintNarrativesDto,
    user: User,
  ): Promise<Complaint> {
    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);
    await this.assertCanView(user, complaint!);

    const perms = await this.getCasePermissions(user);
    const isCreator = complaint!.created_by_id === user.id;

    if (dto.complainer_narrative != null) {
      if (!isCreator && !perms.canAddNarrative && !this.isAdmin(user)) {
        throw new ForbiddenException("You cannot update complainer narrative");
      }
      complaint!.complainer_narrative = dto.complainer_narrative.trim();
    }
    if (dto.accused_narrative != null) {
      if (!perms.canAddNarrative && !this.isAdmin(user)) {
        throw new ForbiddenException("You cannot update accused narrative");
      }
      complaint!.accused_narrative = dto.accused_narrative.trim();
    }
    complaint!.updated_by_id = user.id;
    await this.complaintRepo.save(complaint!);

    await this.logInvestigation(
      id,
      user,
      ComplaintInvestigationAction.NARRATIVE_UPDATE,
      "Narratives updated",
    );

    return this.findOne(id, user);
  }

  async addInvestigationLog(
    id: number,
    dto: AddInvestigationLogDto,
    user: User,
  ): Promise<ComplaintInvestigationLog> {
    const perms = await this.getCasePermissions(user);
    if (!perms.canInvestigate) {
      throw new ForbiddenException("You do not have permission to add investigation remarks");
    }

    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);

    const log = await this.investigationLogRepo.save(
      this.investigationLogRepo.create({
        complaint_id: id,
        action: dto.action || ComplaintInvestigationAction.REMARK,
        remarks: dto.remarks.trim(),
        performed_by_id: user.id,
      }),
    );

    return log;
  }

  async listMeetings(id: number, user: User): Promise<ComplaintMeeting[]> {
    await this.findOne(id, user);
    return this.meetingRepo.find({
      where: { complaint_id: id },
      order: { scheduled_at: "DESC" },
    });
  }

  async createMeeting(
    id: number,
    dto: CreateComplaintMeetingDto,
    user: User,
  ): Promise<ComplaintMeeting> {
    const perms = await this.getCasePermissions(user);
    if (!perms.canScheduleMeetings) {
      throw new ForbiddenException("You do not have permission to schedule meetings");
    }

    const complaint = await this.complaintRepo.findOne({
      where: { id, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);

    const attendeeUsers = this.normalizeIds(dto.attendee_user_ids);
    const meeting = await this.meetingRepo.save(
      this.meetingRepo.create({
        complaint_id: id,
        scheduled_at: new Date(dto.scheduled_at),
        duration_minutes: dto.duration_minutes || 60,
        location: dto.location?.trim() || null,
        agenda: dto.agenda?.trim() || null,
        attendee_user_ids: attendeeUsers.length ? attendeeUsers : null,
        attendee_departments: dto.attendee_departments?.length
          ? dto.attendee_departments
          : null,
        created_by_id: user.id,
      }),
    );

    await this.logInvestigation(
      id,
      user,
      ComplaintInvestigationAction.MEETING_SCHEDULED,
      `Meeting scheduled for ${dto.scheduled_at}`,
      { meeting_id: meeting.id },
    );

    const notifyIds = this.normalizeIds([
      ...attendeeUsers,
      ...(complaint!.nominated_user_ids || []),
    ]);
    await this.notifyUsers(
      complaint!,
      notifyIds,
      "Complaint meeting scheduled",
      `Meeting scheduled for complaint ${complaint!.complaint_code} at ${new Date(dto.scheduled_at).toLocaleString()}`,
      "meeting_scheduled",
      user,
    );

    return meeting;
  }

  async updateMeeting(
    complaintId: number,
    meetingId: number,
    dto: UpdateComplaintMeetingDto,
    user: User,
  ): Promise<ComplaintMeeting> {
    const perms = await this.getCasePermissions(user);
    if (!perms.canScheduleMeetings) {
      throw new ForbiddenException("You do not have permission to update meetings");
    }

    const complaint = await this.complaintRepo.findOne({
      where: { id: complaintId, type: ComplaintKind.COMPLAINT },
    });
    this.assertCaseRecord(complaint);

    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId, complaint_id: complaintId },
    });
    if (!meeting) throw new NotFoundException("Meeting not found");

    Object.assign(meeting, {
      ...(dto.scheduled_at != null ? { scheduled_at: new Date(dto.scheduled_at) } : {}),
      ...(dto.duration_minutes != null ? { duration_minutes: dto.duration_minutes } : {}),
      ...(dto.location != null ? { location: dto.location.trim() } : {}),
      ...(dto.agenda != null ? { agenda: dto.agenda.trim() } : {}),
      ...(dto.discussion_notes != null
        ? { discussion_notes: dto.discussion_notes.trim() }
        : {}),
      ...(dto.status != null ? { status: dto.status } : {}),
      ...(dto.attendee_user_ids != null
        ? { attendee_user_ids: this.normalizeIds(dto.attendee_user_ids) }
        : {}),
      ...(dto.attendee_departments != null
        ? { attendee_departments: dto.attendee_departments }
        : {}),
    });

    const saved = await this.meetingRepo.save(meeting);

    if (dto.status === ComplaintMeetingStatus.COMPLETED) {
      await this.logInvestigation(
        complaintId,
        user,
        ComplaintInvestigationAction.MEETING_COMPLETED,
        dto.discussion_notes || "Meeting completed",
        { meeting_id: meetingId },
      );
    }

    return saved;
  }

  async trackByCode(code: string) {
    const normalized = String(code || "").trim().toUpperCase();
    const complaint = await this.complaintRepo.findOne({
      where: { complaint_code: normalized, type: ComplaintKind.COMPLAINT },
      select: [
        "id",
        "complaint_code",
        "title",
        "complaint_workflow_status",
        "complaint_category",
        "created_at",
        "updated_at",
        "resolution_summary",
      ],
    });
    if (!complaint) {
      throw new NotFoundException("Complaint not found for this reference code");
    }

    const logs = await this.investigationLogRepo.find({
      where: {
        complaint_id: complaint.id,
        action: ComplaintInvestigationAction.STATUS_CHANGE,
      },
      order: { created_at: "ASC" },
      select: ["action", "remarks", "metadata", "created_at"],
    });

    const meetingsCount = await this.meetingRepo.count({
      where: { complaint_id: complaint.id },
    });

    return {
      complaint_code: complaint.complaint_code,
      title: complaint.title,
      status: complaint.complaint_workflow_status,
      category: complaint.complaint_category,
      created_at: complaint.created_at,
      updated_at: complaint.updated_at,
      resolution_summary: complaint.resolution_summary,
      status_history: logs,
      meetings_count: meetingsCount,
    };
  }

  getCategories() {
    return Object.values(ComplaintCategory).map((value) => ({
      value,
      label: value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }

  getWorkflowStatuses() {
    return Object.values(ComplaintWorkflowStatus).map((value) => ({
      value,
      label: value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }
}
