import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder, IsNull, Not, Brackets } from "typeorm";
import {
  Task,
  TaskStatus,
  TaskWorkflowType,
  TaskType,
} from "./entities/task.entity";
import {
  TaskNotification,
  TaskNotificationType,
} from "./entities/task-notification.entity";
import { TaskAttachment } from "./entities/task-attachment.entity";
import { TaskComment } from "./entities/task-comment.entity";
import { TaskActivity } from "./entities/task-activity.entity";
import { TaskTimeEntry } from "./entities/task-time-entry.entity";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { AssignTaskDto } from "./dto/assign-task.dto";
import { ApproveTaskDto } from "./dto/approve-task.dto";
import { AddAttachmentDto } from "./dto/add-attachment.dto";
import { AddCommentDto } from "./dto/add-comment.dto";
import { StatusTransitionDto } from "./dto/status-transition.dto";
import { User, UserRole } from "../users/user.entity";
import { EmailService } from "../email/email.service";
import { applyCommonFilters } from "../utils/filters/common-filter.util";
import { PermissionsService } from "../permissions/permissions.service";
import * as fs from "fs";
import * as path from "path";
import { TaskApproval } from "./entities/task-approval.entity";

@Injectable()
export class TasksService {
  private readonly searchableColumns = ["title", "description", "project_name"];

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskAttachment)
    private readonly attachmentRepo: Repository<TaskAttachment>,
    @InjectRepository(TaskComment)
    private readonly commentRepo: Repository<TaskComment>,
    @InjectRepository(TaskActivity)
    private readonly activityRepo: Repository<TaskActivity>,
    @InjectRepository(TaskNotification)
    private readonly notificationRepo: Repository<TaskNotification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TaskTimeEntry)
    private readonly timeEntryRepo: Repository<TaskTimeEntry>,
    @InjectRepository(TaskApproval)
    private readonly taskApprovalRepo: Repository<TaskApproval>,
    private readonly emailService: EmailService,
    private readonly permissionsService: PermissionsService,
  ) { }

  private userDisplayName(u?: User | null): string | null {
    if (!u) return null;
    const full = `${u.first_name || ""} ${u.last_name || ""}`.trim() || null;
    return full || u.email || null;
  }

  private async getTaskScope(
    user: User,
  ): Promise<"org" | "department" | "team" | "self"> {
    const permissions = await this.permissionsService.getUserPermissions(
      Number(user.id),
    );
    const deptKey =
      user.department &&
        permissions?.[user.department] &&
        permissions[user.department]?.tasks
        ? user.department
        : null;
    const modulePermissions =
      (deptKey ? permissions?.[deptKey]?.tasks : null) ||
      permissions?.admin?.tasks ||
      permissions?.tasking?.tasks ||
      permissions?.tasks ||
      {};
    const reports = modulePermissions?.reports || {};
    if (reports.view_all === true) return "org";
    if (reports.view_dept === true) return "department";
    if (reports.view_team === true) return "team";
    if (reports.view_own === true) return "self";

    // Fallback based on role if no explicit scope is defined in reports
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      return "org";
    }
    if (
      (user.role === UserRole.MANAGER || user.role === UserRole.DEPT_HEAD) &&
      user.department
    ) {
      return "department";
    }
    if (user.role === UserRole.TEAM_LEAD) {
      return "team";
    }

    return "self";
  }

  private async getTaskPermissionsForUser(user: User): Promise<{
    canView: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canAssign: boolean;
    canApprove: boolean;
    canComplete: boolean;
    canEditCompleted: boolean;
    reportScope: "org" | "department" | "team" | "self";
  }> {
    const permissions = await this.permissionsService.getUserPermissions(
      Number(user.id),
    );
    const deptKey =
      user.department && permissions?.[user.department]?.tasks
        ? user.department
        : null;
    const modulePermissions =
      (deptKey ? permissions?.[deptKey]?.tasks : null) ||
      permissions?.admin?.tasks ||
      permissions?.tasking?.tasks ||
      permissions?.tasks ||
      {};
    const reports = modulePermissions?.reports || {};
    const actions =
      reports && Object.keys(reports).length > 0 ? reports : modulePermissions;
    let scope: "org" | "department" | "team" | "self" = "self";
    if (reports.view_all === true) {
      scope = "org";
    } else if (reports.view_dept === true) {
      scope = "department";
    } else if (reports.view_team === true) {
      scope = "team";
    } else if (reports.view_own === true) {
      scope = "self";
    } else {
      // Fallback based on role if no explicit scope is defined in reports
      if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
        scope = "org";
      } else if (
        (user.role === UserRole.MANAGER || user.role === UserRole.DEPT_HEAD) &&
        user.department
      ) {
        scope = "department";
      } else if (user.role === UserRole.TEAM_LEAD) {
        scope = "team";
      }
    }
    const canViewBase = actions.view === true;
    const canViewReports =
      reports.view_all === true ||
      reports.view_dept === true ||
      reports.view_team === true ||
      reports.view_own === true;
    const canUpdate =
      actions.update === true || permissions?.super_admin === true;
    const canEditCompleted =
      actions.edit_completed === true ||
      actions.update === true ||
      permissions?.super_admin === true;
    return {
      canView:
        canViewBase || canViewReports || permissions?.super_admin === true,
      canCreate: actions.create === true || permissions?.super_admin === true,
      canUpdate,
      canDelete: actions.delete === true || permissions?.super_admin === true,
      canAssign: actions.assign === true || permissions?.super_admin === true,
      canApprove: actions.approve === true || permissions?.super_admin === true,
      canComplete:
        actions.complete === true || permissions?.super_admin === true,
      canEditCompleted,
      reportScope: scope,
    };
  }

  private async upsertTaskApprovalState(task: Task): Promise<void> {
    if (!task || !task.id) {
      return;
    }
    const approvalStatusCandidates: TaskStatus[] = [
      TaskStatus.PENDING_APPROVAL,
      TaskStatus.APPROVED,
      TaskStatus.REJECTED,
    ];
    const existing = await this.taskApprovalRepo.findOne({
      where: { task_id: task.id },
    });
    let approvalStatus = existing?.approval_status ?? null;
    if (approvalStatusCandidates.includes(task.status)) {
      approvalStatus = task.status;
    } else if (task.status === TaskStatus.CLOSED) {
      approvalStatus = existing?.approval_status ?? null;
    } else {
      approvalStatus = null;
    }
    const record =
      existing ??
      this.taskApprovalRepo.create({
        task_id: task.id,
      });
    record.approval_required_user_ids =
      task.approval_required_user_ids ??
      record.approval_required_user_ids ??
      null;
    record.approved_by_id =
      task.approved_by_id ?? record.approved_by_id ?? null;
    record.rejected_by_id =
      task.rejected_by_id ?? record.rejected_by_id ?? null;
    record.approval_status = approvalStatus;
    await this.taskApprovalRepo.save(record);
  }

  private async setTaskApprovalMeta(
    taskId: number,
    meta:
      | {
        user_id: number;
        decision: "approved" | "rejected" | "pending";
        decided_at?: Date;
      }[]
      | null,
  ): Promise<void> {
    if (!taskId) return;
    const existing = await this.taskApprovalRepo.findOne({
      where: { task_id: taskId },
    });
    const record =
      existing ??
      this.taskApprovalRepo.create({
        task_id: taskId,
      });
    record.approvals_meta = meta;
    await this.taskApprovalRepo.save(record);
  }

  private async applyRoleFilters(
    qb: SelectQueryBuilder<Task>,
    user?: User,
  ): Promise<void> {
    if (!user) return;

    qb.andWhere(
      new Brackets((mainQb) => {
        // A. Super Admin & Admin: Always see all tasks
        if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
          mainQb.where("1=1");
          return;
        }

        // B. Required Approver: See tasks they need to approve (even across departments)
        mainQb.where("task.approval_required_user_ids @> ARRAY[:userId]::int[]", {
          userId: user.id,
        });

        // C. Direct Involvement: See tasks where user is assigned, creator, or reporter (regardless of department)
        mainQb.orWhere("task.assigned_user_ids @> ARRAY[:userId]::int[]", { userId: user.id });
        mainQb.orWhere("task.created_by_id = :userId", { userId: user.id });
        mainQb.orWhere("task.reported_by_id = :userId", { userId: user.id });

        // D. Role-based Department Visibility: Leaders see all tasks within their department
        if (
          user.department &&
          (user.role === UserRole.DEPT_HEAD ||
            user.role === UserRole.MANAGER ||
            user.role === UserRole.TEAM_LEAD)
        ) {
          mainQb.orWhere("task.department::text = :userDept", {
            userDept: user.department,
          });
        }
      }),
    );
  }

  async create(dto: CreateTaskDto, currentUser: User): Promise<Task> {
    try {
      const task = this.taskRepo.create({
        title: dto.title,
        description: dto.description,
        department: dto.department,
        priority: dto.priority,
        workflow_type: dto.workflow_type || TaskWorkflowType.STANDARD,
        task_type: dto.task_type || TaskType.ONE_TIME,
        start_date: dto.start_date ? new Date(dto.start_date) : null,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        project_id: dto.project_id || null,
        project_name: dto.project_name || null,
        recurrence_rule: dto.recurrence_rule || null,
        recurrence_next_date: dto.recurrence_next_date
          ? new Date(dto.recurrence_next_date)
          : null,
        reported_by_id:
          typeof dto.reported_by_id === "number" ? dto.reported_by_id : null,
        created_by_id: currentUser?.id ?? null,
        assigned_user_ids: Array.isArray(dto.assigned_users)
          ? dto.assigned_users
          : null,
        assigned_users_meta:
          Array.isArray(dto.assigned_users_meta) &&
            dto.assigned_users_meta.length > 0
            ? dto.assigned_users_meta
            : null,
        approval_required_user_ids: Array.isArray(
          dto.approval_required_user_ids,
        )
          ? dto.approval_required_user_ids
          : null,
      });

      const saved = await this.taskRepo.save(task);
      await this.logActivity(saved, currentUser, "created", {
        title: saved.title,
      });

      return saved;
    } catch (e) {
      throw e;
    }
  }

  async findAll(payload: any, currentUser?: User) {
    try {
      const page = +(payload?.pagination?.page || payload?.page || 1);
      const pageSize = +(
        payload?.pagination?.pageSize ||
        payload?.pageSize ||
        10
      );
      const sortField = payload?.sortField || "created_at";
      const sortOrder = payload?.sortOrder || "DESC";

      const qb = this.taskRepo.createQueryBuilder("task");
      await this.applyRoleFilters(qb, currentUser);

      const safeFilters = { ...payload };
      delete safeFilters.pagination;
      delete safeFilters.page;
      delete safeFilters.pageSize;
      delete safeFilters.sortField;
      delete safeFilters.sortOrder;

      if (safeFilters.filters) {
        Object.assign(safeFilters, safeFilters.filters);
        delete safeFilters.filters;
      }

      // Handle department filter
      let departmentFilter: string | undefined = undefined;
      if (safeFilters.department) {
        departmentFilter = safeFilters.department;
        delete safeFilters.department;
      }

      const isStrictDept = payload?.strictDepartment === true;
      delete safeFilters.strictDepartment;

      applyCommonFilters(qb, safeFilters, this.searchableColumns, "task");

      if (departmentFilter) {
        if (isStrictDept) {
          // Strict mode: Only tasks explicitly in this department,
          // BUT still allow those where the user is an assignee or approver.
          // This ensures assignees see their tasks even if they are in a different department list.
          qb.andWhere(new Brackets((dqb) => {
            dqb.where("task.department::text = :department", { department: departmentFilter });
            if (currentUser) {
              dqb.orWhere("task.assigned_user_ids @> ARRAY[:userId]::int[]", { userId: currentUser.id });
              dqb.orWhere("task.approval_required_user_ids @> ARRAY[:userId]::int[]", { userId: currentUser.id });
            }
          }));
        } else {
          // Flexible mode: Tasks in this department OR tasks where user is directly involved
          qb.andWhere(new Brackets((dqb) => {
            dqb.where("task.department::text = :department", { department: departmentFilter });

            if (currentUser) {
              dqb.orWhere("task.assigned_user_ids @> ARRAY[:userId]::int[]", { userId: currentUser.id });
              dqb.orWhere("task.created_by_id = :userId", { userId: currentUser.id });
              dqb.orWhere("task.reported_by_id = :userId", { userId: currentUser.id });
              dqb.orWhere("task.approval_required_user_ids @> ARRAY[:userId]::int[]", { userId: currentUser.id });
            }
          }));
        }
      }

      const validSort = [
        "title",
        "priority",
        "status",
        "department",
        "due_date",
        "created_at",
      ];
      const sortName = validSort.includes(sortField) ? sortField : "created_at";
      qb.orderBy(`task.${sortName}`, sortOrder as "ASC" | "DESC");

      const skip = (page - 1) * pageSize;
      qb.skip(skip).take(pageSize);

      const [data, total] = await qb.getManyAndCount();
      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNext: page < Math.ceil(total / pageSize),
          hasPrev: page > 1,
        },
      };
    } catch (e) {
      throw e;
    }
  }

  async getDashboardStats(filters: any, currentUser?: User) {
    try {
      const qb = this.taskRepo.createQueryBuilder("task");
      await this.applyRoleFilters(qb, currentUser);

      if (filters.start_date) {
        qb.andWhere("task.created_at >= :start_date", {
          start_date: filters.start_date,
        });
      }
      if (filters.end_date) {
        qb.andWhere("task.created_at <= :end_date", {
          end_date: filters.end_date,
        });
      }
      if (filters.department) {
        qb.andWhere("task.department::text = :filterDept", {
          filterDept: filters.department
        });
      }
      if (filters.project_id) {
        qb.andWhere("task.project_id = :project_id", {
          project_id: filters.project_id,
        });
      }

      const totalTasks = await qb.getCount();

      const statusBreakdown = await qb
        .clone()
        .select("task.status", "status")
        .addSelect("COUNT(task.id)", "count")
        .groupBy("task.status")
        .getRawMany();

      const priorityBreakdown = await qb
        .clone()
        .select("task.priority", "priority")
        .addSelect("COUNT(task.id)", "count")
        .groupBy("task.priority")
        .getRawMany();

      const overdueTasks = await qb
        .clone()
        .andWhere("task.due_date < CURRENT_DATE")
        .andWhere("task.status NOT IN (:...completedStatuses)", {
          completedStatuses: [
            TaskStatus.COMPLETED,
            TaskStatus.CLOSED,
            TaskStatus.CANCELLED,
          ],
        })
        .getCount();

      const completedTasks = await qb
        .clone()
        .andWhere("task.status = :completedStatus", {
          completedStatus: TaskStatus.CLOSED,
        })
        .getCount();

      const completionRate =
        totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0;

      return {
        total_tasks: totalTasks,
        status_breakdown: statusBreakdown.reduce(
          (acc, item) => ({ ...acc, [item.status]: +item.count }),
          {},
        ),
        priority_breakdown: priorityBreakdown.reduce(
          (acc, item) => ({ ...acc, [item.priority]: +item.count }),
          {},
        ),
        overdue_tasks: overdueTasks,
        completion_rate: parseFloat(completionRate as string),
      };
    } catch (e) {
      throw e;
    }
  }

  async getReports(query: any, currentUser?: User) {
    try {
      const dateField =
        query?.date_field === "completed"
          ? "task.completed_date"
          : "task.created_at";
      const qb = this.taskRepo.createQueryBuilder("task");
      await this.applyRoleFilters(qb, currentUser);

      if (query.start_date) {
        qb.andWhere(`${dateField} >= :start_date`, {
          start_date: query.start_date,
        });
      }
      if (query.end_date) {
        qb.andWhere(`${dateField} <= :end_date`, { end_date: query.end_date });
      }
      if (query.department) {
        qb.andWhere("task.department::text = :department", {
          department: query.department
        });
      }
      if (query.project_id) {
        qb.andWhere("task.project_id = :project_id", {
          project_id: query.project_id,
        });
      }

      const tasks = await qb.getMany();

      const userCountsMap: Record<string, { label: string; count: number }> = {};
      const projectCountsMap: Record<string, number> = {};
      let totalDays = 0;
      let completedCount = 0;

      // Pre-fetch user names to avoid multiple queries or complex joins if preferred, 
      // but let's just collect all unique user IDs first.
      const allUserIds = new Set<number>();
      for (const t of tasks) {
        if (Array.isArray(t.assigned_user_ids)) {
          t.assigned_user_ids.forEach(id => allUserIds.add(Number(id)));
        }
      }

      const usersList = allUserIds.size > 0 
        ? await this.userRepo.createQueryBuilder("user")
            .where("user.id IN (:...ids)", { ids: Array.from(allUserIds) })
            .getMany()
        : [];
      
      const userNamesMap = new Map<number, string>();
      usersList.forEach(u => {
        const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || `User #${u.id}`;
        userNamesMap.set(Number(u.id), name);
      });

      for (const t of tasks) {
        if (
          Array.isArray(t.assigned_user_ids) &&
          t.assigned_user_ids.length > 0
        ) {
          for (const uid of t.assigned_user_ids) {
            const userId = Number(uid);
            const name = userNamesMap.get(userId) || `User #${userId}`;
            if (!userCountsMap[userId]) {
              userCountsMap[userId] = { label: name, count: 0 };
            }
            userCountsMap[userId].count++;
          }
        } else {
          const label = "Unassigned";
          if (!userCountsMap[label]) {
            userCountsMap[label] = { label: "Unassigned", count: 0 };
          }
          userCountsMap[label].count++;
        }

        const projectKey = t.project_name || "No Project";
        projectCountsMap[projectKey] = (projectCountsMap[projectKey] || 0) + 1;

        if (t.start_date && t.completed_date) {
          const start = new Date(t.start_date);
          const completed = new Date(t.completed_date);
          const diffMs = completed.getTime() - start.getTime();
          const days = diffMs / (1000 * 60 * 60 * 24);
          if (!isNaN(days) && days >= 0) {
            totalDays += days;
            completedCount += 1;
          }
        }
      }

      const users = Object.values(userCountsMap).map((item) => ({
        label: item.label,
        count: item.count,
      }));
      const projects = Object.entries(projectCountsMap).map(
        ([label, count]) => ({
          label,
          count,
        }),
      );
      const avgCompletionDays =
        completedCount > 0 ? +(totalDays / completedCount).toFixed(2) : null;

      const stats = await this.getDashboardStats(
        {
          start_date: query.start_date,
          end_date: query.end_date,
          department: query.department,
          project_id: query.project_id,
        },
        currentUser,
      );

      return {
        users,
        projects,
        avgCompletionDays,
        stats,
      };
    } catch (e) {
      throw e;
    }
  }

  async findOne(id: number, currentUser?: User): Promise<Task> {
    try {
      const qb = this.taskRepo
        .createQueryBuilder("task")
        .where("task.id = :id", { id })
        .leftJoinAndSelect("task.attachments", "attachments")
        .leftJoinAndSelect("task.comments", "comments")
        .leftJoinAndSelect("comments.author", "comment_author")
        .leftJoinAndSelect("task.activities", "activities")
        .leftJoinAndSelect("activities.performed_by", "activity_performed_by")
        .leftJoinAndSelect("task.reported_by", "reported_by")
        .leftJoinAndSelect("task.created_by", "created_by")
        .leftJoinAndSelect("task.updated_by", "updated_by");

      const task = await qb.getOne();
      if (!task) {
        throw new NotFoundException("Task not found");
      }

      if (currentUser) {
        const perms = await this.getTaskPermissionsForUser(currentUser);
        const userId = Number(currentUser.id);
        const assignedIds = Array.isArray(task.assigned_user_ids)
          ? task.assigned_user_ids.map((v) => Number(v)).filter((v) => !isNaN(v))
          : [];
        const approverIds = Array.isArray(task.approval_required_user_ids)
          ? task.approval_required_user_ids
            .map((v) => Number(v))
            .filter((v) => !isNaN(v))
          : [];
        const isAssignee = assignedIds.includes(userId);
        const isApprover = approverIds.includes(userId);
        const isReporterOrCreator =
          (task.reported_by_id != null &&
            Number(task.reported_by_id) === userId) ||
          (task.created_by_id != null &&
            Number(task.created_by_id) === userId);
        const isAdminRole =
          currentUser.role === UserRole.SUPER_ADMIN ||
          currentUser.role === UserRole.ADMIN;

        if (
          !perms.canView &&
          !isAdminRole &&
          !isAssignee &&
          !isApprover &&
          !isReporterOrCreator
        ) {
          throw new ForbiddenException(
            "Insufficient permissions to view this task",
          );
        }
      }

      return task;
    } catch (e) {
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdateTaskDto,
    currentUser: User,
  ): Promise<Task> {
    try {
      const task = await this.findOne(id, currentUser);

      if (
        task.status === TaskStatus.COMPLETED &&
        dto.status !== TaskStatus.PENDING_APPROVAL &&
        dto.status !== TaskStatus.CLOSED
      ) {
        if (
          currentUser.role !== UserRole.SUPER_ADMIN &&
          currentUser.role !== UserRole.ADMIN
        ) {
          throw new ForbiddenException("Only Admins can edit completed tasks");
        }
      }

      // If user is trying to CLOSE a COMPLETED task, allow it if they are the creator or reporter
      if (task.status === TaskStatus.COMPLETED && dto.status === TaskStatus.CLOSED) {
        const isCreator = task.created_by_id === currentUser.id;
        const isReporter = task.reported_by_id === currentUser.id;
        const isAdmin = currentUser.role === UserRole.SUPER_ADMIN || currentUser.role === UserRole.ADMIN;
        
        if (!isCreator && !isReporter && !isAdmin) {
          throw new ForbiddenException("Only the creator, assigner, or an Admin can close this task.");
        }
      }

      const oldStatus = task.status;

      if (dto.status && dto.status !== oldStatus) {
        const allowedTransitions: Record<string, TaskStatus[]> = {
          [TaskStatus.DRAFT]: [TaskStatus.OPEN],
          [TaskStatus.OPEN]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
          [TaskStatus.IN_PROGRESS]: [
            TaskStatus.COMPLETED,
            TaskStatus.CANCELLED,
            TaskStatus.BLOCKED,
          ],
          [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
          [TaskStatus.COMPLETED]:
            task.workflow_type === TaskWorkflowType.APPROVAL_REQUIRED
              ? [TaskStatus.PENDING_APPROVAL, TaskStatus.IN_PROGRESS]
              : [TaskStatus.CLOSED, TaskStatus.IN_PROGRESS],
          [TaskStatus.PENDING_APPROVAL]: [
            TaskStatus.APPROVED,
            TaskStatus.REJECTED,
            TaskStatus.CLOSED,
            TaskStatus.IN_PROGRESS,
          ],
          [TaskStatus.APPROVED]: [TaskStatus.CLOSED],
          [TaskStatus.REJECTED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
          [TaskStatus.CLOSED]: [TaskStatus.OPEN],
          [TaskStatus.CANCELLED]: [TaskStatus.OPEN],
        };

        const validNext = allowedTransitions[oldStatus] || [];
        if (!validNext.includes(dto.status)) {
          throw new ConflictException(
            `Invalid status transition from ${oldStatus} to ${dto.status}`,
          );
        }
      } else {
        if (
          oldStatus === TaskStatus.CLOSED ||
          oldStatus === TaskStatus.CANCELLED
        ) {
          throw new ConflictException("Cannot edit Closed/Cancelled tasks");
        }
      }

      let newCompletedDate = task.completed_date;
      let shouldResetApprovalWorkflow = false;
      let shouldResetApprovalsForRework = false;
      let newProgress = task.progress;
      const nextStatus = dto.status ?? oldStatus;

      if (dto.status && dto.status !== oldStatus) {
        // Reset progress when reopening from Closed or Cancelled
        if (
          (oldStatus === TaskStatus.CLOSED ||
            oldStatus === TaskStatus.CANCELLED) &&
          nextStatus === TaskStatus.OPEN
        ) {
          newProgress = 0;
        }

        const workflowType =
          dto.workflow_type !== undefined
            ? dto.workflow_type
            : task.workflow_type;

        if (workflowType === TaskWorkflowType.STANDARD) {
          if (dto.status === TaskStatus.COMPLETED) {
            newCompletedDate = newCompletedDate ?? new Date();
          }
        } else if (workflowType === TaskWorkflowType.APPROVAL_REQUIRED) {
          if (dto.status === TaskStatus.APPROVED) {
            newCompletedDate = newCompletedDate ?? new Date();
          }
        }
      }

      const isApprovalWorkflow =
        task.workflow_type === TaskWorkflowType.APPROVAL_REQUIRED ||
        dto.workflow_type === TaskWorkflowType.APPROVAL_REQUIRED;
      if (
        isApprovalWorkflow &&
        nextStatus === TaskStatus.OPEN &&
        task.completed_date
      ) {
        shouldResetApprovalWorkflow = true;
        newCompletedDate = null;
        newProgress = 0;
      }
      if (
        isApprovalWorkflow &&
        oldStatus === TaskStatus.REJECTED &&
        nextStatus === TaskStatus.IN_PROGRESS
      ) {
        shouldResetApprovalsForRework = true;
      }

      let updatedApprovedByIds = task.approved_by_id;
      let updatedRejectedByIds = task.rejected_by_id;

      if (shouldResetApprovalWorkflow || shouldResetApprovalsForRework) {
        const approvers = Array.isArray(task.approval_required_user_ids)
          ? task.approval_required_user_ids
            .map((v) => Number(v))
            .filter((v) => !isNaN(v))
          : [];
        if (approvers.length > 0) {
          await this.setTaskApprovalMeta(
            task.id,
            approvers.map((userId) => ({
              user_id: userId,
              decision: "pending" as const,
            })),
          );
        } else {
          await this.setTaskApprovalMeta(task.id, null);
        }
        updatedApprovedByIds = null;
        updatedRejectedByIds = null;
      }

      const oldProgress = task.progress;
      Object.assign(task, {
        title: dto.title ?? task.title,
        description: dto.description ?? task.description,
        department: dto.department ?? task.department,
        priority: dto.priority ?? task.priority,
        status: dto.status ?? task.status,
        workflow_type: dto.workflow_type ?? task.workflow_type,
        task_type: dto.task_type ?? task.task_type,
        start_date: dto.start_date ? new Date(dto.start_date) : task.start_date,
        due_date: dto.due_date ? new Date(dto.due_date) : task.due_date,
        completed_date: newCompletedDate,
        project_id: dto.project_id ?? task.project_id,
        project_name: dto.project_name ?? task.project_name,
        assigned_user_ids: Array.isArray(dto.assigned_users)
          ? dto.assigned_users
          : task.assigned_user_ids,
        assigned_users_meta:
          Array.isArray(dto.assigned_users_meta) &&
            dto.assigned_users_meta.length > 0
            ? dto.assigned_users_meta
            : task.assigned_users_meta,
        recurrence_rule: dto.recurrence_rule ?? task.recurrence_rule,
        recurrence_next_date: dto.recurrence_next_date
          ? new Date(dto.recurrence_next_date)
          : task.recurrence_next_date,
        progress: newProgress,
        reported_by_id:
          typeof dto.reported_by_id === "number"
            ? dto.reported_by_id
            : task.reported_by_id,
        approval_required_user_ids: Array.isArray(
          dto.approval_required_user_ids,
        )
          ? dto.approval_required_user_ids
          : task.approval_required_user_ids,
        approved_by_id: updatedApprovedByIds,
        rejected_by_id: updatedRejectedByIds,
        updated_by_id: currentUser?.id ?? task.updated_by_id,
      });
      const saved = await this.taskRepo.save(task);

      if (saved.progress !== oldProgress) {
        await this.logActivity(saved, currentUser, "progress_updated", {
          from_progress: oldProgress,
          progress: saved.progress,
          notes: "Progress reset due to task reopening/rework.",
        });
      }
      await this.upsertTaskApprovalState(saved);
      if (shouldResetApprovalWorkflow) {
        await this.logActivity(
          saved,
          currentUser,
          "Task reopened – approval workflow reset",
          {},
        );

        const approverIds = Array.isArray(saved.approval_required_user_ids)
          ? saved.approval_required_user_ids
            .map((v) => Number(v))
            .filter((v) => !isNaN(v))
          : [];
        if (approverIds.length > 0) {
          const approvers = await this.userRepo
            .createQueryBuilder("user")
            .where("user.id IN (:...ids)", { ids: approverIds })
            .getMany();
          for (const u of approvers) {
            await this.createNotification(
              saved,
              u,
              TaskNotificationType.ASSIGNED,
            );
          }
        }
      }
      await this.logActivity(saved, currentUser, "updated", { changes: dto });
      return this.findOne(saved.id, currentUser);
    } catch (e) {
      throw e;
    }
  }

  async transitionStatus(
    id: number,
    dto: StatusTransitionDto,
    currentUser: User,
  ): Promise<Task> {
    const task = await this.findOne(id, currentUser);
    const perms = await this.getTaskPermissionsForUser(currentUser);
    const assignedIds = Array.isArray(task.assigned_user_ids)
      ? task.assigned_user_ids.map((v) => Number(v)).filter((v) => !isNaN(v))
      : [];
    const metaIds = Array.isArray(task.assigned_users_meta)
      ? (task.assigned_users_meta
        .map((m: any) => (m && m.user_id != null ? Number(m.user_id) : null))
        .filter((v) => v !== null && !isNaN(v as number)) as number[])
      : [];
    const allAssignedIds = [...assignedIds, ...metaIds];
    const currentUserId = Number(currentUser.id);
    const isAssignee = allAssignedIds.includes(currentUserId);
    const isCreator = task.created_by_id === currentUserId;
    const isReporter = task.reported_by_id === currentUserId;

    if (!perms.canUpdate) {
      if (!perms.canView || (!isAssignee && !isCreator && !isReporter)) {
        throw new ForbiddenException(
          "Insufficient permissions to change task status",
        );
      }
    }
    const workflowType = task.workflow_type;
    const nextStatus = dto.status;
    const isApprovalWorkflow =
      workflowType === TaskWorkflowType.APPROVAL_REQUIRED;
    const isAdminRole =
      currentUser.role === UserRole.SUPER_ADMIN ||
      currentUser.role === UserRole.ADMIN;
    if (
      isApprovalWorkflow &&
      [TaskStatus.CLOSED, TaskStatus.APPROVED, TaskStatus.REJECTED].includes(
        nextStatus,
      )
    ) {
      if (!perms.canApprove && !isAdminRole && !isCreator && !isReporter) {
        throw new ForbiddenException(
          "Only approvers, admins, creators, or assigners can update this status",
        );
      }
    }
    if (
      nextStatus === TaskStatus.CLOSED &&
      !perms.canUpdate &&
      !isAdminRole &&
      !perms.canApprove &&
      !isCreator &&
      !isReporter
    ) {
      throw new ForbiddenException("Only authorized staff can close tasks");
    }
    const oldStatus = task.status;
    if (
      nextStatus === TaskStatus.COMPLETED &&
      task.description &&
      task.description.trim().length > 0 &&
      task.progress < 100
    ) {
      throw new BadRequestException(
        "Task cannot be marked as completed until all MOV points are completed.",
      );
    }
    const updated = await this.update(
      id,
      { status: dto.status } as UpdateTaskDto,
      currentUser,
    );
    if (
      isApprovalWorkflow &&
      dto.status === TaskStatus.PENDING_APPROVAL &&
      dto.notes
    ) {
      const approval = await this.taskApprovalRepo.findOne({
        where: { task_id: updated.id },
      });
      if (approval) {
        const existingNotes = Array.isArray(approval.submission_note)
          ? approval.submission_note
          : [];
        const noteEntry = {
          user_id: Number(currentUser.id),
          note: dto.notes.slice(0, 500),
          created_at: new Date(),
        };
        approval.submission_note = [...existingNotes, noteEntry];
        await this.taskApprovalRepo.save(approval);
      }
    }
    await this.logActivity(updated, currentUser, "status_transition", {
      from_status: oldStatus,
      to_status: updated.status,
      notes: dto.notes ? dto.notes.slice(0, 500) : undefined,
    });
    return this.findOne(id, currentUser);
  }

  async assign(
    id: number,
    dto: AssignTaskDto,
    currentUser: User,
  ): Promise<Task> {
    try {
      const task = await this.findOne(id, currentUser);
      task.status =
        task.status === TaskStatus.DRAFT ? TaskStatus.OPEN : task.status;

      if (Array.isArray(dto.assigned_users) && dto.assigned_users.length > 0) {
        task.assigned_user_ids = dto.assigned_users;
      }

      if (
        Array.isArray(dto.assigned_users_meta) &&
        dto.assigned_users_meta.length > 0
      ) {
        task.assigned_users_meta = dto.assigned_users_meta as any;
      } else if (
        Array.isArray(dto.assigned_users) &&
        dto.assigned_users.length === 0
      ) {
        task.assigned_user_ids = [];
        task.assigned_users_meta = null;
      }

      if (
        Array.isArray(task.assigned_users_meta) &&
        task.assigned_users_meta.length > 0
      ) {
        const firstMeta = task.assigned_users_meta[0] as any;
        if (firstMeta && firstMeta.department) {
          task.department = firstMeta.department as any;
        }
      }

      const saved = await this.taskRepo.save(task);
      await this.logActivity(saved, currentUser, "assigned", {
        assigned_user_ids: saved.assigned_user_ids,
      });
      return saved;
    } catch (e) {
      throw e;
    }
  }

  async reassign(
    id: number,
    dto: AssignTaskDto,
    currentUser: User,
  ): Promise<Task> {
    try {
      const task = await this.findOne(id, currentUser);
      if (
        currentUser.role !== UserRole.SUPER_ADMIN &&
        currentUser.role !== UserRole.ADMIN &&
        currentUser.role !== UserRole.MANAGER
      ) {
        throw new ForbiddenException(
          "Only Admin/Manager roles can reassign tasks",
        );
      }

      const oldAssignedUserIds = Array.isArray(task.assigned_user_ids)
        ? [...task.assigned_user_ids]
        : null;
      const oldAssignedUsersMeta = Array.isArray(task.assigned_users_meta)
        ? [...task.assigned_users_meta]
        : null;

      if (Array.isArray(dto.assigned_users)) {
        task.assigned_user_ids = dto.assigned_users;
      }

      if (
        Array.isArray(dto.assigned_users_meta) &&
        dto.assigned_users_meta.length > 0
      ) {
        task.assigned_users_meta = dto.assigned_users_meta as any;
      } else if (
        Array.isArray(dto.assigned_users) &&
        dto.assigned_users.length === 0
      ) {
        task.assigned_user_ids = [];
        task.assigned_users_meta = null;
      }

      const saved = await this.taskRepo.save(task);

      const fromItems: any[] = [];
      const toItems: any[] = [];

      if (
        Array.isArray(oldAssignedUsersMeta) &&
        oldAssignedUsersMeta.length > 0
      ) {
        for (const m of oldAssignedUsersMeta) {
          if (!m) continue;
          fromItems.push({
            type: "from",
            user_id:
              typeof m.user_id === "number"
                ? m.user_id
                : Number(m.user_id) || null,
            department: m.department || null,
          });
        }
      } else if (
        Array.isArray(oldAssignedUserIds) &&
        oldAssignedUserIds.length > 0
      ) {
        for (const id of oldAssignedUserIds) {
          fromItems.push({
            type: "from",
            user_id: id,
            department: null,
          });
        }
      }

      if (
        Array.isArray(saved.assigned_users_meta) &&
        saved.assigned_users_meta.length > 0
      ) {
        for (const m of saved.assigned_users_meta as any[]) {
          if (!m) continue;
          toItems.push({
            type: "to",
            user_id:
              typeof m.user_id === "number"
                ? m.user_id
                : Number(m.user_id) || null,
            department: m.department || null,
          });
        }
      } else if (
        Array.isArray(saved.assigned_user_ids) &&
        saved.assigned_user_ids.length > 0
      ) {
        for (const id of saved.assigned_user_ids) {
          toItems.push({
            type: "to",
            user_id: id,
            department: null,
          });
        }
      }

      const details = [...fromItems, ...toItems];

      await this.logActivity(saved, currentUser, "reassigned", details);

      if (
        Array.isArray(saved.assigned_user_ids) &&
        saved.assigned_user_ids.length > 0
      ) {
        const users = await this.userRepo
          .createQueryBuilder("user")
          .where("user.id IN (:...ids)", { ids: saved.assigned_user_ids })
          .getMany();
        for (const u of users) {
          await this.createNotification(
            saved,
            u,
            TaskNotificationType.ASSIGNED,
          );
        }
      }

      return saved;
    } catch (e) {
      throw e;
    }
  }

  async approve(
    id: number,
    dto: ApproveTaskDto,
    currentUser: User,
  ): Promise<Task> {
    try {
      const task = await this.findOne(id, currentUser);
      if (task.workflow_type !== TaskWorkflowType.APPROVAL_REQUIRED) {
        throw new ConflictException("Task does not require approval");
      }
      const approvers = Array.isArray(task.approval_required_user_ids)
        ? task.approval_required_user_ids
          .map((v) => Number(v))
          .filter((v) => !isNaN(v))
        : [];
      const isAdminRole =
        currentUser.role === UserRole.SUPER_ADMIN ||
        currentUser.role === UserRole.ADMIN;
      if (approvers.length > 0 && !isAdminRole) {
        const isConfiguredApprover = approvers.includes(Number(currentUser.id));
        if (!isConfiguredApprover) {
          throw new ForbiddenException(
            "You are not configured as an approver for this task",
          );
        }
      }

      const now = new Date();
      const approvalState = await this.taskApprovalRepo.findOne({
        where: { task_id: task.id },
      });
      const existingMeta = Array.isArray(approvalState?.approvals_meta)
        ? (approvalState!.approvals_meta as {
          user_id: number;
          decision: "approved" | "rejected" | "pending";
          decided_at?: Date;
        }[])
        : [];
      const normalizedMeta = approvers.length
        ? approvers.map((userId) => {
          const existing = existingMeta.find(
            (m) => m && Number(m.user_id) === Number(userId),
          );
          if (existing) {
            return existing;
          }
          return {
            user_id: userId,
            decision: "pending" as const,
          };
        })
        : existingMeta;

      const updatedMeta: {
        user_id: number;
        decision: "approved" | "rejected" | "pending";
        decided_at?: Date;
      }[] = normalizedMeta.map((entry) => {
        if (Number(entry.user_id) !== Number(currentUser.id)) {
          return entry;
        }
        return {
          user_id: entry.user_id,
          decision: dto.approve ? "approved" : "rejected",
          decided_at: now,
        };
      });

      let newStatus = task.status;
      if (dto.approve) {
        if (approvers.length > 0) {
          const approverMeta = updatedMeta.filter((e) =>
            approvers.includes(Number(e.user_id)),
          );
          const allApproved =
            approverMeta.length > 0 &&
            approverMeta.every((e) => e.decision === "approved");
          const anyRejected =
            approverMeta.length > 0 &&
            approverMeta.some((e) => e.decision === "rejected");
          if (allApproved) {
            newStatus = TaskStatus.APPROVED;
          } else if (anyRejected) {
            newStatus = TaskStatus.REJECTED;
          } else {
            newStatus = TaskStatus.PENDING_APPROVAL;
          }
        } else {
          newStatus = TaskStatus.APPROVED;
        }
      } else {
        newStatus = TaskStatus.REJECTED;
      }

      task.status = newStatus;
      const normalizedMetaForSave = updatedMeta.length > 0 ? updatedMeta : null;
      if (newStatus === TaskStatus.APPROVED) {
        const approvedUserIds = updatedMeta
          .filter((m) => m && m.decision === "approved")
          .map((m) => Number(m.user_id))
          .filter((n) => Number.isInteger(n) && n > 0);
        task.approved_by_id =
          approvedUserIds.length > 0 ? approvedUserIds : null;
        task.completed_date = task.completed_date ?? now;
        task.rejected_by_id = null;
      } else if (newStatus === TaskStatus.REJECTED) {
        const rejectedUserIds = updatedMeta
          .filter((m) => m && m.decision === "rejected")
          .map((m) => Number(m.user_id))
          .filter((n) => Number.isInteger(n) && n > 0);
        task.rejected_by_id =
          rejectedUserIds.length > 0 ? rejectedUserIds : null;
      }
      const saved = await this.taskRepo.save(task);
      await this.setTaskApprovalMeta(task.id, normalizedMetaForSave);
      await this.upsertTaskApprovalState(saved);
      if (dto.note) {
        const approvalRecord = await this.taskApprovalRepo.findOne({
          where: { task_id: task.id },
        });
        if (approvalRecord) {
          const trimmed = dto.note.slice(0, 500);
          if (dto.approve) {
            const existingApproved = Array.isArray(approvalRecord.approved_note)
              ? approvalRecord.approved_note
              : [];
            const entry = {
              user_id: Number(currentUser.id),
              note: trimmed,
              decided_at: now,
            };
            approvalRecord.approved_note = [...existingApproved, entry];
          } else {
            const existingRejected = Array.isArray(approvalRecord.rejected_note)
              ? approvalRecord.rejected_note
              : [];
            const entry = {
              user_id: Number(currentUser.id),
              note: trimmed,
              decided_at: now,
            };
            approvalRecord.rejected_note = [...existingRejected, entry];
          }
          await this.taskApprovalRepo.save(approvalRecord);
        }
      }
      await this.logActivity(
        saved,
        currentUser,
        dto.approve ? "approved" : "rejected",
        { note: dto.note },
      );
      return saved;
    } catch (e) {
      throw e;
    }
  }

  async complete(id: number, currentUser: User): Promise<Task> {
    try {
      const task = await this.findOne(id, currentUser);
      task.status = TaskStatus.COMPLETED;
      if (task.workflow_type === TaskWorkflowType.STANDARD) {
        task.completed_date = task.completed_date ?? new Date();
      }
      const saved = await this.taskRepo.save(task);
      await this.logActivity(saved, currentUser, "completed", {});
      return saved;
    } catch (e) {
      throw e;
    }
  }

  async getApprovalStateForTask(
    taskId: number,
    currentUser: User,
  ): Promise<TaskApproval | null> {
    await this.findOne(taskId, currentUser);
    const approval = await this.taskApprovalRepo.findOne({
      where: { task_id: taskId },
    });
    return approval || null;
  }

  async getApprovalsForUserDashboard(
    currentUser: User,
  ): Promise<TaskApproval[]> {
    const userId = Number(currentUser.id);
    if (!Number.isFinite(userId)) {
      return [];
    }
    const qb = this.taskApprovalRepo
      .createQueryBuilder("ta")
      .leftJoinAndSelect("ta.task", "task")
      .where("ta.approval_required_user_ids @> ARRAY[:userId]::int[]", { userId })
      .andWhere("ta.approval_status IS NOT NULL");

    const approvals = await qb.getMany();
    return approvals;
  }

  async addAttachment(
    id: number,
    dto: AddAttachmentDto,
    currentUser: User,
  ): Promise<TaskAttachment> {
    try {
      const task = await this.findOne(id, currentUser);
      const att = this.attachmentRepo.create({
        task,
        file_name: dto.file_name,
        file_url: dto.file_url,
        file_type: dto.file_type,
        uploaded_by: currentUser,
      });
      const saved = await this.attachmentRepo.save(att);
      await this.logActivity(task, currentUser, "attachment_added", {
        file_name: dto.file_name,
      });
      return saved;
    } catch (e) {
      throw e;
    }
  }

  async removeAttachment(
    taskId: number,
    attachmentId: number,
    currentUser: User,
  ): Promise<{ deleted: boolean }> {
    try {
      const task = await this.findOne(taskId, currentUser);

      const attachment = await this.attachmentRepo.findOne({
        where: { id: attachmentId },
        relations: ["task"],
      });

      if (!attachment || !attachment.task || attachment.task.id !== task.id) {
        throw new NotFoundException("Attachment not found for this task");
      }

      if (attachment.file_url && attachment.file_url.startsWith("/files/")) {
        const relative = attachment.file_url.replace("/files/", "");
        const filePath = path.join(process.cwd(), "uploads", relative);
        try {
          await fs.promises.unlink(filePath);
        } catch {
          // ignore filesystem errors - metadata removal is still valid
        }
      }

      await this.attachmentRepo.remove(attachment);
      await this.logActivity(task, currentUser, "attachment_removed", {
        file_name: attachment.file_name,
      });

      return { deleted: true };
    } catch (e) {
      throw e;
    }
  }

  async addComment(
    id: number,
    dto: AddCommentDto,
    currentUser: User,
  ): Promise<TaskComment> {
    try {
      const task = await this.findOne(id, currentUser);
      const comment = this.commentRepo.create({
        task,
        content: dto.content,
        author: currentUser,
      });
      const saved = await this.commentRepo.save(comment);
      const withAuthor = await this.commentRepo.findOne({
        where: { id: saved.id },
        relations: ["author"],
      });
      await this.logActivity(task, currentUser, "comment_added", {
        content: dto.content?.slice(0, 120),
      });
      return withAuthor || saved;
    } catch (e) {
      throw e;
    }
  }

  async getWorkHistory(
    id: number,
    currentUser: User,
  ): Promise<{
    entries: {
      id: number;
      seconds: number;
      created_at: Date;
      notes?: string | null;
    }[];
    total_seconds: number;
    active_entry: {
      id: number;
      started_at: Date;
    } | null;
  }> {
    const task = await this.findOne(id, currentUser);

    const entries = await this.timeEntryRepo.find({
      where: { task: { id: task.id } },
      order: { created_at: "DESC" },
    });

    const totalSeconds = entries.reduce(
      (acc, e) => acc + (Number(e.seconds) || 0),
      0,
    );

    const active = await this.timeEntryRepo.findOne({
      where: {
        task: { id: task.id },
        user: { id: currentUser.id },
        started_at: Not(IsNull()),
        stopped_at: IsNull(),
      },
      order: { created_at: "DESC" },
    });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        seconds: e.seconds,
        created_at: e.created_at,
        notes: e.notes,
      })),
      total_seconds: totalSeconds,
      active_entry: active
        ? {
          id: active.id,
          started_at: active.started_at,
        }
        : null,
    };
  }

  async addTimeEntry(
    id: number,
    payload: { action: string; seconds?: number; notes?: string },
    currentUser: User,
  ): Promise<TaskTimeEntry | null> {
    const task = await this.findOne(id, currentUser);
    const action = (payload.action || "").toLowerCase();
    const now = new Date();

    if (action === "start") {
      const existing = await this.timeEntryRepo.findOne({
        where: {
          task: { id: task.id },
          user: { id: currentUser.id },
          started_at: Not(IsNull()),
          stopped_at: IsNull(),
        },
      });
      if (existing) {
        return existing;
      }
      const entry = this.timeEntryRepo.create({
        task,
        user: currentUser,
        seconds: 0,
        notes: payload.notes || null,
        started_at: now,
        stopped_at: null,
      });
      const saved = await this.timeEntryRepo.save(entry);
      await this.logActivity(task, currentUser, "time_started", {});
      return saved;
    }

    if (action === "stop") {
      const existing = await this.timeEntryRepo.findOne({
        where: {
          task: { id: task.id },
          user: { id: currentUser.id },
          started_at: Not(IsNull()),
          stopped_at: IsNull(),
        },
      });
      if (!existing || !existing.started_at) {
        return null;
      }
      const diffMs = now.getTime() - existing.started_at.getTime();
      const seconds = Math.max(0, Math.floor(diffMs / 1000));
      existing.seconds = seconds;
      existing.stopped_at = now;
      const saved = await this.timeEntryRepo.save(existing);
      await this.logActivity(task, currentUser, "time_stopped", {
        seconds,
      });
      return saved;
    }

    if (action === "manual") {
      const seconds = Math.max(0, Math.floor(Number(payload.seconds) || 0));
      if (!seconds) {
        return null;
      }
      const entry = this.timeEntryRepo.create({
        task,
        user: currentUser,
        seconds,
        notes: payload.notes || null,
        started_at: null,
        stopped_at: null,
      });
      const saved = await this.timeEntryRepo.save(entry);
      await this.logActivity(task, currentUser, "time_manual", {
        seconds,
      });
      return saved;
    }

    return null;
  }

  async updateProgress(
    id: number,
    payload: { progress: number; notes?: string },
    currentUser: User,
  ): Promise<Task> {
    const task = await this.findOne(id, currentUser);
    const value = Math.min(100, Math.max(0, Number(payload.progress) || 0));
    const oldProgress = task.progress;
    task.progress = value;
    task.last_progress_notes = payload.notes || null;
    await this.taskRepo.save(task);

    // Only log activity if progress increased (i.e., an item was checked)
    if (value > oldProgress) {
      await this.logActivity(task, currentUser, "progress_updated", {
        progress: value,
        notes: payload.notes?.slice(0, 120),
      });
    }

    const refreshed = await this.findOne(id, currentUser);
    return refreshed;
  }

  async overdueEscalation(): Promise<number> {
    try {
      const qb: SelectQueryBuilder<Task> = this.taskRepo
        .createQueryBuilder("task")
        .where("task.due_date IS NOT NULL")
        .andWhere("task.due_date < CURRENT_DATE")
        .andWhere(`task.status NOT IN (:...statuses)`, {
          statuses: [
            TaskStatus.COMPLETED,
            TaskStatus.CLOSED,
            TaskStatus.CANCELLED,
          ],
        });
      const tasks = await qb.getMany();
      for (const t of tasks) {
        const escalationLevel = 1;
        const adminEmail =
          process.env.NOTIFICATION_EMAIL || "dev@mtjfoundation.org";
        await this.emailService.sendTaskOverdueNotification(
          adminEmail,
          t,
          escalationLevel,
        );
        await this.logActivity(t, null as any, "overdue_escalated", {
          escalation_level: escalationLevel,
        });
      }
      return tasks.length;
    } catch (e) {
      throw e;
    }
  }

  async remove(id: number, currentUser: User): Promise<{ deleted: boolean }> {
    try {
      const task = await this.findOne(id, currentUser);
      await this.taskRepo.delete(task.id);
      return { deleted: true };
    } catch (e) {
      throw e;
    }
  }

  private async createNotification(
    task: Task,
    user: User,
    type: TaskNotificationType,
  ) {
    if (!user) return;
    try {
      const n = this.notificationRepo.create({
        task,
        user,
        type,
      });
      await this.notificationRepo.save(n);
    } catch (e) {
      console.error("Failed to create notification", e);
    }
  }

  private async logActivity(
    task: Task,
    user: User | null,
    action: string,
    details: any,
  ) {
    try {
      const basePayload: any = {
        task,
        action,
        details,
        performed_by: user || null,
        created_by: user || null,
        updated_by: user || null,
      };

      if (
        action === "updated" &&
        details &&
        typeof details === "object" &&
        details.changes &&
        typeof details.changes === "object"
      ) {
        const changes = details.changes as any;
        const payload = {
          ...basePayload,
          title: changes.title ?? null,
          description: changes.description ?? null,
          priority: changes.priority ?? null,
          status: changes.status ?? null,
          workflow_type: changes.workflow_type ?? null,
          task_type: changes.task_type ?? null,
          start_date: changes.start_date ? new Date(changes.start_date) : null,
          due_date: changes.due_date ? new Date(changes.due_date) : null,
          project_name: changes.project_name ?? null,
          recurrence_rule: changes.recurrence_rule ?? null,
          recurrence_next_date: changes.recurrence_next_date
            ? new Date(changes.recurrence_next_date)
            : null,
          assigned_user_ids: Array.isArray(changes.assigned_users)
            ? changes.assigned_users
            : null,
          assigned_users_meta: Array.isArray(changes.assigned_users_meta)
            ? changes.assigned_users_meta
            : null,
          progress: changes.progress ?? null,
        };
        const activity = this.activityRepo.create(payload);
        await this.activityRepo.save(activity);
        return;
      }

      const activity = this.activityRepo.create(basePayload);
      await this.activityRepo.save(activity);
    } catch (e) {
      throw e;
    }
  }
}
