import { Injectable, BadRequestException, Logger, Optional } from "@nestjs/common";
import { EntityManager, In } from "typeorm";
import { CeoNote, CeoNoteStatus } from "./entities/ceo-note.entity";
import { User, Department } from "../users/user.entity";
import { Task, TaskPriority, TaskWorkflowType, TaskType } from "../tasks/entities/task.entity";
import { CeoNoteAuditService } from "./ceo-note-audit.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CeoNoteCategoryService } from "./ceo-note-category.service";
import { TasksService } from "../tasks/tasks.service";
import { CreateTaskDto } from "../tasks/dto/create-task.dto";

@Injectable()
export class CeoNoteConversionService {
  private readonly logger = new Logger(CeoNoteConversionService.name);

  constructor(
    private readonly auditService: CeoNoteAuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly categoryService: CeoNoteCategoryService,
    @Optional() private readonly tasksService?: TasksService,
  ) {}

  private async getAssignedUsersMeta(
    manager: EntityManager,
    userIds?: number[],
  ): Promise<{ user_id: number; department: Department; name: string }[] | null> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return null;
    }
    const numericUserIds = userIds.map((id) => Number(id)).filter((id) => !isNaN(id));
    if (numericUserIds.length === 0) {
      return null;
    }
    const users = await manager.getRepository(User).find({ where: { id: In(numericUserIds) } });
    return users.map((u) => ({
      user_id: u.id,
      department: u.department,
      name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || `User #${u.id}`,
    }));
  }

  /**
   * Automatically resolves all active, non-archived reporting managers for the given assignees.
   * Traverses both the DMS user management relation (`assignee.managers` via `user_managers`)
   * and the direct `assignee.manager_id` foreign key.
   */
  private async getReportingManagerIds(
    manager: EntityManager,
    userIds?: number[] | null,
  ): Promise<number[]> {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const numericUserIds = userIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (numericUserIds.length === 0) return [];

    const userRepo = manager.getRepository(User);
    const assignees = await userRepo.find({
      where: { id: In(numericUserIds) },
      relations: ["managers"],
    });

    const managerIds: number[] = [];
    for (const assignee of assignees) {
      if (Array.isArray(assignee.managers) && assignee.managers.length > 0) {
        for (const mgr of assignee.managers) {
          if (mgr && mgr.id != null) {
            managerIds.push(Number(mgr.id));
          }
        }
      }
      if (
        assignee.manager_id != null &&
        Number.isInteger(Number(assignee.manager_id)) &&
        Number(assignee.manager_id) > 0
      ) {
        managerIds.push(Number(assignee.manager_id));
      }
    }

    if (managerIds.length === 0) return [];

    const validManagers = await userRepo.find({
      where: {
        id: In(Array.from(new Set(managerIds))),
        is_archived: false,
        isActive: true,
      },
      select: ["id"],
    });
    const validIdSet = new Set(validManagers.map((u) => u.id));
    const result: number[] = [];
    for (const id of managerIds) {
      if (validIdSet.has(id) && !result.includes(id)) {
        result.push(id);
      }
    }
    return result;
  }

  private async getPrimaryAssigneeManagerId(
    manager: EntityManager,
    userIds?: number[] | null,
  ): Promise<number | null> {
    const ids = await this.getReportingManagerIds(manager, userIds);
    return ids.length > 0 ? ids[0] : null;
  }

  private mapPriority(priority: string): TaskPriority {
    switch (priority) {
      case "low":
        return TaskPriority.LOW;
      case "medium":
        return TaskPriority.MEDIUM;
      case "high":
        return TaskPriority.HIGH;
      case "critical":
        return TaskPriority.CRITICAL;
      default:
        return TaskPriority.MEDIUM;
    }
  }

  async convertToTask(
    manager: EntityManager,
    note: CeoNote,
    convertToTaskDto: any,
    currentUser: User,
  ) {
    if (!note) {
      throw new BadRequestException("Note does not exist");
    }

    const existingTask = note.related_task_id
      ? await manager.getRepository(Task).findOne({
          where: { id: note.related_task_id },
        })
      : await manager.getRepository(Task).findOne({
          where: { source: "ceo_note", source_id: note.id },
        });
    if (existingTask) {
      return { note, task: existingTask, created: false };
    }

    const title = convertToTaskDto.title || convertToTaskDto.task_title || note.title;
    const description =
      convertToTaskDto.description ||
      convertToTaskDto.task_description ||
      note.details ||
      "";
    const department =
      convertToTaskDto.department ||
      convertToTaskDto.task_department ||
      note.department ||
      Department.ADMIN;
    const priority =
      convertToTaskDto.priority ||
      convertToTaskDto.task_priority ||
      this.mapPriority(note.priority);
    const dueDateStr =
      convertToTaskDto.due_date ||
      convertToTaskDto.task_due_date ||
      (note.due_date instanceof Date
        ? note.due_date.toISOString().split("T")[0]
        : note.due_date
          ? String(note.due_date).split("T")[0]
          : undefined);
    const assignedUsers =
      convertToTaskDto.assigned_users || note.assigned_user_ids || [];

    const workflow_type = convertToTaskDto.workflow_type || TaskWorkflowType.STANDARD;
    const task_type = convertToTaskDto.task_type || TaskType.ONE_TIME;
    const approval_required =
      workflow_type === TaskWorkflowType.APPROVAL_REQUIRED ||
      !!convertToTaskDto.approval_required;

    const movChecklist = convertToTaskDto.mov_checklist || (
      Array.isArray(convertToTaskDto.mov_items)
        ? convertToTaskDto.mov_items.filter(Boolean).map((item: any) => ({
            text: typeof item === "string" ? item : item?.text || "",
            checked: false,
            checked_by_id: null as any,
            checked_at: null as any,
          }))
        : undefined
    );

    let savedTask: Task;

    if (this.tasksService) {
      const createTaskDto: CreateTaskDto = {
        title,
        description,
        department,
        priority,
        workflow_type,
        task_type,
        start_date: convertToTaskDto.start_date || undefined,
        due_date: dueDateStr,
        original_due_date: convertToTaskDto.original_due_date || dueDateStr,
        assigned_users: assignedUsers,
        assigned_users_meta: convertToTaskDto.assigned_users_meta,
        project_name: convertToTaskDto.project_name || undefined,
        project_id: convertToTaskDto.project_id || undefined,
        recurrence_rule: convertToTaskDto.recurrence_rule || undefined,
        recurrence_next_date: convertToTaskDto.recurrence_next_date || undefined,
        recurrence_end_type: convertToTaskDto.recurrence_end_type || undefined,
        recurrence_end_date: convertToTaskDto.recurrence_end_date || undefined,
        recurrence_end_occurrences: convertToTaskDto.recurrence_end_occurrences || undefined,
        approval_required,
        approval_due_date: convertToTaskDto.approval_due_date || undefined,
        approval_required_user_ids: convertToTaskDto.approval_required_user_ids || undefined,
        mov_checklist: movChecklist,
        mov_assignments: convertToTaskDto.mov_assignments || undefined,
        reported_to_ids: convertToTaskDto.reported_to_ids || undefined,
        source: "ceo_note",
        source_id: note.id,
      };
      savedTask = await this.tasksService.create(createTaskDto, currentUser);
    } else {
      const assignedUsersMeta = await this.getAssignedUsersMeta(manager, assignedUsers);

      const explicitReporterIds = Array.isArray(convertToTaskDto.reported_to_ids)
        ? convertToTaskDto.reported_to_ids
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isInteger(id) && id > 0)
        : convertToTaskDto.reported_to_id != null && Number(convertToTaskDto.reported_to_id) > 0
          ? [Number(convertToTaskDto.reported_to_id)]
          : [];

      // Multi-manager support: resolve all reporting managers for the assigned users
      const reporterIds: number[] =
        explicitReporterIds.length > 0
          ? Array.from<number>(new Set(explicitReporterIds))
          : await this.getReportingManagerIds(manager, assignedUsers);

      const primaryReporterId = reporterIds.length > 0 ? reporterIds[0] : null;

      const taskRepository = manager.getRepository(Task);

      // Create the task storing reporting manager IDs in reported_to and reported_to_ids
      const task: Task = taskRepository.create({
        title,
        description,
        department,
        priority,
        workflow_type,
        task_type,
        start_date: convertToTaskDto.start_date ? new Date(convertToTaskDto.start_date) : null,
        due_date: dueDateStr ? new Date(dueDateStr) : null,
        original_due_date: dueDateStr ? new Date(dueDateStr) : null,
        project_name: convertToTaskDto.project_name || null,
        project_id: convertToTaskDto.project_id || null,
        recurrence_rule: convertToTaskDto.recurrence_rule || null,
        recurrence_next_date: convertToTaskDto.recurrence_next_date ? new Date(convertToTaskDto.recurrence_next_date) : null,
        recurrence_end_type: convertToTaskDto.recurrence_end_type || null,
        recurrence_end_date: convertToTaskDto.recurrence_end_date ? new Date(convertToTaskDto.recurrence_end_date) : null,
        recurrence_end_occurrences: convertToTaskDto.recurrence_end_occurrences || null,
        approval_due_date: convertToTaskDto.approval_due_date ? new Date(convertToTaskDto.approval_due_date) : null,
        approval_required_user_ids: Array.isArray(convertToTaskDto.approval_required_user_ids)
          ? convertToTaskDto.approval_required_user_ids
          : null,
        reported_to: reporterIds.length > 0 ? reporterIds : null,
        reported_to_id: primaryReporterId,
        reported_to_ids: reporterIds.length > 0 ? reporterIds : null,
        assigned_user_ids: assignedUsers.length > 0 ? assignedUsers : null,
        assigned_users_meta: assignedUsersMeta,
        mov_items: Array.isArray(convertToTaskDto.mov_items)
          ? convertToTaskDto.mov_items.filter((item: any) => !!item)
          : movChecklist ? movChecklist.map((m: any) => m.text) : null,
        mov_assignments: Array.isArray(convertToTaskDto.mov_assignments)
          ? convertToTaskDto.mov_assignments
          : null,
        created_by_id: currentUser?.id || null,
        source: "ceo_note",
        source_id: note.id,
      });

      savedTask = await taskRepository.save(task);
    }

    const oldValue = { ...note };
    note.related_task_id = savedTask.id;
    note.status = note.status === "approved" ? note.status : CeoNoteStatus.IN_PROGRESS;
    if (convertToTaskDto.assigned_users !== undefined) {
      note.assigned_user_ids = assignedUsers;
    }
    const savedNote = await manager.getRepository(CeoNote).save(note);

    await this.auditService.log(
      savedNote,
      currentUser,
      "converted_to_task",
      oldValue,
      { note: savedNote, task_id: savedTask.id },
      manager,
    );

    // Sync category record status after conversion
    try {
      await this.categoryService.updateCategoryRecord(manager, savedNote, { status: savedNote.status });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Category sync after conversion failed for note ${savedNote.id}: ${errorMessage}`);
    }

    try {
      this.eventEmitter.emit("task.created", {
        title: "CEO Note Converted to Task",
        message: `A task for note "${savedNote.title}" has been created.`,
        link: `/tasks/${savedTask.id}`,
        metadata: {
          noteId: savedNote.id,
          taskId: savedTask.id,
        },
        userIds: assignedUsers,
        user: currentUser,
      });
    } catch (eventErr: any) {
      this.logger.warn(`task.created emit failed: ${eventErr?.message}`);
    }

    try {
      this.eventEmitter.emit("ceo_note.converted_to_task", {
        title: "CEO Note Converted to Task",
        message: `CEO note "${savedNote.title}" was converted to a task.`,
        link: `/ceo-office/notes/${savedNote.id}`,
        metadata: {
          noteId: savedNote.id,
          taskId: savedTask.id,
        },
        userIds: assignedUsers,
        user: currentUser,
      });
    } catch (eventErr: any) {
      this.logger.warn(`ceo_note.converted_to_task emit failed: ${eventErr?.message}`);
    }

    return { note: savedNote, task: savedTask, created: true };
  }
}
