import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DonorInteraction } from "./entities/donor-interaction.entity";
import { DonorFollowup } from "./entities/donor-followup.entity";
import { Donor } from "../donor/entities/donor.entity";
import { CreateDonorInteractionDto } from "./dto/create-interaction.dto";
import { RescheduleFollowupDto } from "./dto/reschedule-followup.dto";
import { PermissionsService } from "../../permissions/permissions.service";
import { DataScopeService } from "../../permissions/data-scope/data-scope.service";
import { User, UserRole } from "../../users/user.entity";

type CurrentUser = {
  id: number;
  role?: string;
  department?: string;
};

@Injectable()
export class DonorRelationshipService {
  constructor(
    @InjectRepository(DonorInteraction)
    private readonly interactionRepository: Repository<DonorInteraction>,
    @InjectRepository(DonorFollowup)
    private readonly followupRepository: Repository<DonorFollowup>,
    @InjectRepository(Donor)
    private readonly donorRepository: Repository<Donor>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly permissionsService: PermissionsService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async createInteraction(dto: CreateDonorInteractionDto, user: CurrentUser) {
    const donor = await this.assertDonorAccess(dto.donor_id, user);

    const activityDatetime = dto.activity_datetime
      ? new Date(dto.activity_datetime)
      : new Date();
    if (Number.isNaN(activityDatetime.getTime())) {
      throw new BadRequestException("Invalid activity_datetime");
    }

    const assignedToId =
      dto.assigned_to_user_id ?? this.getDonorAssignedUserId(donor) ?? user.id;

    const interaction = this.interactionRepository.create({
      donor_id: donor.id,
      activity_type: dto.activity_type,
      custom_activity_title: dto.custom_activity_title || null,
      assigned_to_user_id: assignedToId,
      activity_datetime: activityDatetime,
      user_action_text: dto.user_action_text,
      donor_response_text: dto.donor_response_text || null,
      donor_response_type: dto.donor_response_type || null,
      next_action_text: dto.next_action_text || null,
      next_followup_datetime: dto.next_followup_datetime
        ? new Date(dto.next_followup_datetime)
        : null,
      status: dto.status || "need_followup",
      created_by: { id: user.id } as User,
    });

    const saved = await this.interactionRepository.save(interaction);

    let followup: DonorFollowup | null = null;
    if (dto.next_followup_datetime) {
      const due = new Date(dto.next_followup_datetime);
      if (!Number.isNaN(due.getTime())) {
        followup = await this.createFollowupFromInteraction(saved, donor, due, user.id);
      }
    }

    return this.findInteractionById(saved.id, user);
  }

  async getDonorInteractions(donorId: number, user: CurrentUser) {
    await this.assertDonorAccess(donorId, user);

    return this.interactionRepository.find({
      where: { donor_id: donorId },
      relations: ["created_by", "assigned_to", "donor"],
      order: { activity_datetime: "DESC" },
    });
  }

  async getMyFollowups(
    user: CurrentUser,
    filters?: { bucket?: string; page?: number; pageSize?: number },
  ) {
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(50, Math.max(1, filters?.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const bucket = (filters?.bucket || "today").toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const qb = this.followupRepository
      .createQueryBuilder("followup")
      .leftJoinAndSelect("followup.donor", "donor")
      .leftJoinAndSelect("donor.assigned_to", "donor_assigned")
      .leftJoinAndSelect("followup.interaction", "interaction")
      .where("followup.assigned_to_user_id = :userId", { userId: user.id });

    if (bucket === "completed") {
      qb.andWhere("followup.status = :status", { status: "completed" });
    } else if (bucket === "overdue") {
      qb.andWhere("followup.status IN (:...open)", {
        open: ["pending", "rescheduled"],
      }).andWhere("followup.due_datetime < :startOfToday", { startOfToday });
    } else if (bucket === "upcoming") {
      qb.andWhere("followup.status IN (:...open)", {
        open: ["pending", "rescheduled"],
      }).andWhere("followup.due_datetime > :endOfToday", { endOfToday });
    } else {
      // today
      qb.andWhere("followup.status IN (:...open)", {
        open: ["pending", "rescheduled"],
      })
        .andWhere("followup.due_datetime >= :startOfToday", { startOfToday })
        .andWhere("followup.due_datetime <= :endOfToday", { endOfToday });
    }

    qb.orderBy("followup.due_datetime", "ASC");

    const [data, total] = await qb.skip(skip).take(pageSize).getManyAndCount();

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async completeFollowup(id: number, user: CurrentUser) {
    const followup = await this.loadFollowupForUser(id, user);
    followup.status = "completed";
    followup.completed_at = new Date();
    followup.completed_by_user_id = user.id;
    await this.followupRepository.save(followup);
    return followup;
  }

  async rescheduleFollowup(
    id: number,
    dto: RescheduleFollowupDto,
    user: CurrentUser,
  ) {
    const followup = await this.loadFollowupForUser(id, user);
    const due = new Date(dto.due_datetime);
    if (Number.isNaN(due.getTime())) {
      throw new BadRequestException("Invalid due_datetime");
    }
    followup.due_datetime = due;
    followup.status = "rescheduled";
    if (dto.followup_reason) {
      followup.followup_reason = dto.followup_reason;
    }
    await this.followupRepository.save(followup);
    return followup;
  }

  async getManagementOverview(user: CurrentUser, filters?: { fromDate?: string; toDate?: string }) {
    await this.assertManagementAccess(user);

    const from = filters?.fromDate
      ? new Date(`${filters.fromDate}T00:00:00`)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const to = filters?.toDate
      ? new Date(`${filters.toDate}T23:59:59`)
      : new Date(new Date().setHours(23, 59, 59, 999));

    const todayActivities = await this.interactionRepository
      .createQueryBuilder("i")
      .where("i.activity_datetime BETWEEN :from AND :to", { from, to })
      .getCount();

    const pendingFollowups = await this.followupRepository.count({
      where: [{ status: "pending" }, { status: "rescheduled" }],
    });

    const overdueFollowups = await this.followupRepository
      .createQueryBuilder("f")
      .where("f.status IN (:...s)", { s: ["pending", "rescheduled"] })
      .andWhere("f.due_datetime < :now", { now: new Date() })
      .getCount();

    const completedFollowups = await this.followupRepository.count({
      where: { status: "completed" },
    });

    const userRows = await this.interactionRepository
      .createQueryBuilder("i")
      .select("i.created_by", "userId")
      .addSelect("COUNT(*)", "activities")
      .where("i.activity_datetime BETWEEN :from AND :to", { from, to })
      .groupBy("i.created_by")
      .getRawMany();

    const recentInteractions = await this.interactionRepository.find({
      relations: ["donor", "created_by"],
      order: { activity_datetime: "DESC" },
      take: 25,
    });

    return {
      summary: {
        todayActivities,
        pendingFollowups,
        overdueFollowups,
        completedFollowups,
      },
      userActivity: userRows,
      recentInteractions,
    };
  }

  async getAssignedDonorsForSelect(user: CurrentUser) {
    const qb = this.donorRepository
      .createQueryBuilder("donor")
      .select(["donor.id", "donor.name", "donor.phone", "donor.email"])
      .where("donor.is_archived = false")
      .orderBy("donor.name", "ASC");

    if (!(await this.canBypassDonorAssignment(user))) {
      qb.andWhere("donor.assigned_to = :userId", { userId: user.id });
    }

    return qb.getMany();
  }

  private async findInteractionById(id: number, user: CurrentUser) {
    const interaction = await this.interactionRepository.findOne({
      where: { id },
      relations: ["donor", "created_by", "assigned_to"],
    });
    if (!interaction) {
      throw new NotFoundException("Interaction not found");
    }
    await this.assertDonorAccess(interaction.donor_id, user);
    return interaction;
  }

  private async loadFollowupForUser(id: number, user: CurrentUser) {
    const followup = await this.followupRepository.findOne({
      where: { id },
      relations: ["donor", "donor.assigned_to"],
    });
    if (!followup) {
      throw new NotFoundException("Follow-up not found");
    }
    if (Number(followup.assigned_to_user_id) !== Number(user.id)) {
      throw new ForbiddenException("This follow-up is not assigned to you");
    }
    await this.assertDonorAccess(followup.donor_id, user);
    return followup;
  }

  private async createFollowupFromInteraction(
    interaction: DonorInteraction,
    donor: Donor,
    due: Date,
    assignedUserId: number,
  ) {
    const title =
      interaction.next_action_text?.slice(0, 255) ||
      `Follow-up: ${interaction.activity_type}`;

    const followup = this.followupRepository.create({
      donor_id: donor.id,
      interaction_id: interaction.id,
      assigned_to_user_id: assignedUserId,
      followup_title: title,
      followup_reason: interaction.next_action_text || null,
      due_datetime: due,
      status: "pending",
      created_by: { id: assignedUserId } as User,
    });

    return this.followupRepository.save(followup);
  }

  private getDonorAssignedUserId(donor: Donor): number | null {
    const assigned = donor.assigned_to as { id?: number } | number | null;
    if (assigned == null) return null;
    return typeof assigned === "object" ? assigned.id ?? null : Number(assigned);
  }

  private async assertDonorAccess(donorId: number, user: CurrentUser): Promise<Donor> {
    const donor = await this.donorRepository.findOne({
      where: { id: donorId },
      relations: ["assigned_to"],
    });
    if (!donor) {
      throw new NotFoundException("Donor not found");
    }
    if (await this.canBypassDonorAssignment(user)) {
      return donor;
    }
    const assignedId = this.getDonorAssignedUserId(donor);
    if (!assignedId || Number(assignedId) !== Number(user.id)) {
      throw new ForbiddenException(
        "You can only interact with donors assigned to you",
      );
    }
    return donor;
  }

  private async assertManagementAccess(user: CurrentUser) {
    if (await this.canBypassDonorAssignment(user)) return;
    const perms = await this.permissionsService.getUserPermissions(user.id);
    if (perms?.fund_raising?.donor_relationship?.manage_overview === true) {
      return;
    }
    throw new ForbiddenException("Management overview access required");
  }

  private async canBypassDonorAssignment(user: CurrentUser): Promise<boolean> {
    if (user?.role === UserRole.SUPER_ADMIN) return true;
    const perms = await this.permissionsService.getUserPermissions(user.id);
    if (perms?.super_admin === true) return true;
    if (perms?.fund_raising_manager === true) return true;
    const scope = this.dataScopeService.readModuleScope(
      perms,
      "fund_raising",
      "donor_relationship",
    );
    return scope === "org";
  }
}
