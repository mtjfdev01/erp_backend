import { EventEmitter2 } from "@nestjs/event-emitter";
import { EntityManager } from "typeorm";
import { CeoNote, CeoNoteStatus } from "./entities/ceo-note.entity";
import { CeoNoteAuditService } from "./ceo-note-audit.service";
import { CeoNoteCategoryService } from "./ceo-note-category.service";
import { CeoNoteConversionService } from "./ceo-note-conversion.service";
import { Task } from "../tasks/entities/task.entity";
import { Department, User } from "../users/user.entity";

describe("CeoNoteConversionService", () => {
  it("stores the primary assignee's manager as the task reporter", async () => {
    const assignedUserId = 27;
    const managerId = 83;
    const taskRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((task) => task),
      save: jest.fn(async (task) => ({ ...task, id: 99 })),
    };
    // Mock user repository to support both:
    // 1. Loading assignee with relations: ["managers"] from DMS user management
    // 2. Querying manager records by ID to verify active and non-archived status
    const userRepository = {
      find: jest.fn().mockImplementation(async (options?: any) => {
        const whereId = options?.where?.id;
        const queriedIds = whereId?._value ?? (Array.isArray(whereId) ? whereId : [whereId]);
        if (Array.isArray(queriedIds) && queriedIds.includes(managerId)) {
          return [{ id: managerId, isActive: true, is_archived: false }];
        }
        return [
          {
            id: assignedUserId,
            department: Department.ADMIN,
            first_name: "Assigned",
            last_name: "User",
            manager_id: managerId,
            managers: [{ id: managerId, isActive: true, is_archived: false }],
          },
        ];
      }),
      findOne: jest.fn().mockResolvedValue({
        id: assignedUserId,
        manager_id: managerId,
        managers: [{ id: managerId, isActive: true, is_archived: false }],
      }),
    };
    const noteRepository = {
      save: jest.fn(async (note) => note),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Task) return taskRepository;
        if (entity === User) return userRepository;
        if (entity === CeoNote) return noteRepository;
        throw new Error("Unexpected repository");
      }),
    } as unknown as EntityManager;
    const service = new CeoNoteConversionService(
      { log: jest.fn() } as unknown as CeoNoteAuditService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { updateCategoryRecord: jest.fn() } as unknown as CeoNoteCategoryService,
    );
    const note = {
      id: 12,
      title: "Follow up",
      details: "",
      department: Department.ADMIN,
      priority: "medium",
      assigned_user_ids: [assignedUserId],
      status: CeoNoteStatus.PENDING,
    } as CeoNote;

    const result = await service.convertToTask(
      manager,
      note,
      {},
      { id: 5 } as User,
    );

    const task = result.task as Task;
    expect(task.reported_to).toEqual([managerId]);
    expect(task.reported_to_ids).toEqual([managerId]);
    expect(task.reported_to_id).toBe(managerId);
    expect(task.reported_to_id).not.toBe(assignedUserId);
  });
});