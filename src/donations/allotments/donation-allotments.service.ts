import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Donation } from "../entities/donation.entity";
import { DonationAllotment } from "./entities/donation-allotment.entity";
import {
  DonationAllotmentSource,
  DonationAllotmentStatus,
} from "./donation-allotment-status.enum";
import { User, UserRole } from "src/users/user.entity";
import { Donor } from "src/dms/donor/entities/donor.entity";
import { PermissionsService } from "src/permissions/permissions.service";
import { PermissionsEntity } from "src/permissions/entities/permissions.entity";
import { NotificationsService } from "src/notifications/notifications.service";
import { NotificationType } from "src/notifications/entities/notification.entity";
import { CreateDonationAllotmentDto } from "./dto/create-donation-allotment.dto";
import { ReviewDonationAllotmentDto } from "./dto/review-donation-allotment.dto";

type AuthUser = Pick<User, "id" | "role" | "department">;

@Injectable()
export class DonationAllotmentsService {
  private readonly logger = new Logger(DonationAllotmentsService.name);

  constructor(
    @InjectRepository(DonationAllotment)
    private readonly allotmentRepository: Repository<DonationAllotment>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PermissionsEntity)
    private readonly permissionsRepository: Repository<PermissionsEntity>,
    private readonly permissionsService: PermissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private formatUserName(user?: User | null): string {
    if (!user) return "Unknown";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return name || user.email || `User #${user.id}`;
  }

  private async resolveApproverNotifyUserIds(
    approverUserId: number | null,
  ): Promise<number[]> {
    if (approverUserId) {
      const approver = await this.userRepository.findOne({
        where: { id: approverUserId, is_archived: false, isActive: true },
        select: ["id"],
      });
      return approver ? [approver.id] : [];
    }

    const rows = await this.permissionsRepository
      .createQueryBuilder("perm")
      .select("perm.user_id", "user_id")
      .where(`perm.permissions->>'fund_raising_manager' = 'true'`)
      .getRawMany();

    const managerIds = rows
      .map((row) => Number(row.user_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (managerIds.length > 0) {
      return managerIds;
    }

    const superRows = await this.permissionsRepository
      .createQueryBuilder("perm")
      .select("perm.user_id", "user_id")
      .where(`perm.permissions->>'super_admin' = 'true'`)
      .getRawMany();

    return superRows
      .map((row) => Number(row.user_id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  private async notifyApproversOnCreate(
    allotment: DonationAllotment,
    donation?: Donation | null,
  ): Promise<void> {
    try {
      const recipientIds = await this.resolveApproverNotifyUserIds(
        allotment.approver_user_id,
      );
      if (recipientIds.length === 0) return;

      const credited = await this.userRepository.findOne({
        where: { id: allotment.credited_to_user_id },
        select: ["id", "first_name", "last_name", "email"],
      });
      const requester = await this.userRepository.findOne({
        where: { id: allotment.requested_by_user_id },
        select: ["id", "first_name", "last_name", "email"],
      });

      const amount = donation?.amount ?? donation?.paid_amount;
      const currency = donation?.currency || "PKR";
      const amountLabel =
        amount != null ? `${amount} ${currency}` : "a donation";

      await this.notificationsService.create(
        {
          title: "Donation allotment needs your approval",
          message: `${this.formatUserName(requester)} requested performance credit for ${this.formatUserName(credited)} on ${amountLabel} (Donation #${allotment.donation_id}).`,
          type: NotificationType.DONATION,
          link: `/donations/allotments/pending`,
          metadata: {
            allotment_id: allotment.id,
            donation_id: allotment.donation_id,
            credited_to_user_id: allotment.credited_to_user_id,
            requested_by_user_id: allotment.requested_by_user_id,
            action: "allotment_pending_approval",
          },
        },
        recipientIds,
        requester,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to notify approvers for allotment #${allotment.id}: ${error?.message}`,
      );
    }
  }

  private async notifyRequesterOnDecision(
    allotment: DonationAllotment,
    action: "approved" | "rejected",
    decidedBy?: AuthUser,
  ): Promise<void> {
    try {
      const notifyIds = new Set<number>([
        allotment.requested_by_user_id,
        allotment.credited_to_user_id,
      ]);
      if (decidedBy?.id) {
        notifyIds.delete(Number(decidedBy.id));
      }

      const userIds = Array.from(notifyIds).filter((id) => id > 0);
      if (userIds.length === 0) return;

      const title =
        action === "approved"
          ? "Donation allotment approved"
          : "Donation allotment rejected";

      await this.notificationsService.create(
        {
          title,
          message: `Your performance credit request for donation #${allotment.donation_id} was ${action}.`,
          type: NotificationType.DONATION,
          link: `/donations/online_donations/view/${allotment.donation_id}`,
          metadata: {
            allotment_id: allotment.id,
            donation_id: allotment.donation_id,
            status: action,
            action: `allotment_${action}`,
          },
        },
        userIds,
        decidedBy,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to notify requester for allotment #${allotment.id}: ${error?.message}`,
      );
    }
  }

  private async isSuperAdmin(userId: number, role?: string): Promise<boolean> {
    if (role === UserRole.SUPER_ADMIN) return true;
    return this.permissionsService.hasPermission(userId, "super_admin");
  }

  private async isFundRaisingManager(userId: number): Promise<boolean> {
    return this.permissionsService.hasPermission(
      userId,
      "fund_raising_manager",
    );
  }

  private getDonorAssigneeId(donor?: Donor | null): number | null {
    if (!donor?.assigned_to) return null;
    const assigned = donor.assigned_to as { id?: number } | number;
    const id = typeof assigned === "object" ? assigned.id : Number(assigned);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private userSummary(user?: User | null) {
    if (!user) return null;
    return {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      user_code: user.user_code,
    };
  }

  private serializeAllotment(allotment: DonationAllotment) {
    return {
      id: allotment.id,
      donation_id: allotment.donation_id,
      status: allotment.status,
      source: allotment.source,
      request_note: allotment.request_note,
      decision_note: allotment.decision_note,
      decided_at: allotment.decided_at,
      created_at: allotment.created_at,
      requested_by: this.userSummary(allotment.requested_by),
      credited_to: this.userSummary(allotment.credited_to),
      approver: this.userSummary(allotment.approver),
      decided_by: this.userSummary(allotment.decided_by),
    };
  }

  private async resolveApproverUserId(
    requesterUserId: number,
  ): Promise<number | null> {
    const requester = await this.userRepository.findOne({
      where: { id: requesterUserId, is_archived: false },
      select: ["id", "manager_id"],
    });
    if (!requester) {
      throw new NotFoundException("Requesting user not found");
    }
    return requester.manager_id ?? null;
  }

  private async assertCanRequestCredit(
    currentUser: AuthUser,
    creditedToUserId: number,
  ): Promise<void> {
    if (await this.isSuperAdmin(currentUser.id, currentUser.role)) return;
    if (Number(currentUser.id) === Number(creditedToUserId)) return;

    const reports = await this.userRepository.find({
      where: { manager_id: currentUser.id, is_archived: false },
      select: ["id"],
    });
    const reportIds = reports.map((r) => r.id);
    if (reportIds.includes(creditedToUserId)) return;

    throw new ForbiddenException(
      "You can only request allotment for yourself or your direct reports",
    );
  }

  private async assertCanDecide(
    allotment: DonationAllotment,
    currentUser: AuthUser,
  ): Promise<void> {
    if (await this.isSuperAdmin(currentUser.id, currentUser.role)) return;
    if (await this.isFundRaisingManager(currentUser.id)) return;
    if (
      allotment.approver_user_id &&
      Number(allotment.approver_user_id) === Number(currentUser.id)
    ) {
      return;
    }
    throw new ForbiddenException(
      "Only the assigned reporting manager (or fundraising manager) can approve or reject this allotment",
    );
  }

  private async assertDonationEligible(donation: Donation): Promise<void> {
    if (String(donation.status || "").toLowerCase() !== "completed") {
      throw new BadRequestException(
        "Allotment is only available for completed donations",
      );
    }
  }

  private async hasApprovedAllotment(donationId: number): Promise<boolean> {
    const existing = await this.allotmentRepository.findOne({
      where: {
        donation_id: donationId,
        status: DonationAllotmentStatus.APPROVED,
        is_archived: false,
      },
    });
    return !!existing;
  }

  private async createAllotmentRecord(params: {
    donationId: number;
    requestedByUserId: number;
    creditedToUserId: number;
    source: DonationAllotmentSource | string;
    requestNote?: string | null;
  }): Promise<DonationAllotment> {
    const pendingDuplicate = await this.allotmentRepository.findOne({
      where: {
        donation_id: params.donationId,
        credited_to_user_id: params.creditedToUserId,
        status: DonationAllotmentStatus.PENDING,
        is_archived: false,
      },
    });
    if (pendingDuplicate) {
      return pendingDuplicate;
    }

    const approverUserId = await this.resolveApproverUserId(
      params.requestedByUserId,
    );

    const allotment = this.allotmentRepository.create({
      donation_id: params.donationId,
      requested_by_user_id: params.requestedByUserId,
      credited_to_user_id: params.creditedToUserId,
      approver_user_id: approverUserId,
      status: DonationAllotmentStatus.PENDING,
      source: params.source,
      request_note: params.requestNote?.trim() || null,
      created_by: { id: params.requestedByUserId } as User,
    });

    const saved = await this.allotmentRepository.save(allotment);

    const donation = await this.donationRepository.findOne({
      where: { id: params.donationId },
      select: ["id", "amount", "paid_amount", "currency"],
    });
    await this.notifyApproversOnCreate(saved, donation);

    return saved;
  }

  /** Called when a donation becomes completed — auto pending allotment if donor is assigned. */
  async onDonationCompleted(
    donationId: number,
    source = "system",
  ): Promise<DonationAllotment | null> {
    try {
      const donation = await this.donationRepository.findOne({
        where: { id: donationId },
        relations: ["donor", "donor.assigned_to"],
      });
      if (!donation) return null;
      if (String(donation.status || "").toLowerCase() !== "completed") {
        return null;
      }
      if (await this.hasApprovedAllotment(donationId)) return null;

      const assigneeId = this.getDonorAssigneeId(donation.donor);
      if (!assigneeId) return null;

      const allotment = await this.createAllotmentRecord({
        donationId,
        requestedByUserId: assigneeId,
        creditedToUserId: assigneeId,
        source: DonationAllotmentSource.AUTO_DONOR_ASSIGNMENT,
        requestNote: `Auto-requested when donation completed (${source})`,
      });

      this.logger.log(
        `Pending allotment #${allotment.id} created for donation #${donationId} → user #${assigneeId}`,
      );
      return allotment;
    } catch (error: any) {
      this.logger.warn(
        `onDonationCompleted failed for donation ${donationId}: ${error?.message}`,
      );
      return null;
    }
  }

  async createRequest(
    donationId: number,
    currentUser: AuthUser,
    dto: CreateDonationAllotmentDto,
  ) {
    const donation = await this.donationRepository.findOne({
      where: { id: donationId, is_archived: false },
    });
    if (!donation) {
      throw new NotFoundException(`Donation with ID ${donationId} not found`);
    }
    await this.assertDonationEligible(donation);

    if (await this.hasApprovedAllotment(donationId)) {
      throw new BadRequestException(
        "This donation already has an approved allotment",
      );
    }

    const creditedToUserId = dto.credited_to_user_id ?? currentUser.id;
    await this.assertCanRequestCredit(currentUser, creditedToUserId);

    const creditedUser = await this.userRepository.findOne({
      where: { id: creditedToUserId, is_archived: false },
    });
    if (!creditedUser) {
      throw new NotFoundException("Credited user not found");
    }

    const allotment = await this.createAllotmentRecord({
      donationId,
      requestedByUserId: currentUser.id,
      creditedToUserId,
      source: DonationAllotmentSource.STAFF_CLAIM,
      requestNote: dto.request_note,
    });

    const loaded = await this.findOneById(allotment.id);
    return this.serializeAllotment(loaded);
  }

  async listForDonation(donationId: number) {
    const rows = await this.allotmentRepository.find({
      where: { donation_id: donationId, is_archived: false },
      relations: [
        "requested_by",
        "credited_to",
        "approver",
        "decided_by",
      ],
      order: { created_at: "DESC" },
    });
    return rows.map((row) => this.serializeAllotment(row));
  }

  async listPendingForApprover(currentUser: AuthUser) {
    const qb = this.allotmentRepository
      .createQueryBuilder("allotment")
      .leftJoinAndSelect("allotment.donation", "donation")
      .leftJoinAndSelect("donation.donor", "donor")
      .leftJoinAndSelect("allotment.requested_by", "requested_by")
      .leftJoinAndSelect("allotment.credited_to", "credited_to")
      .leftJoinAndSelect("allotment.approver", "approver")
      .where("allotment.is_archived = :archived", { archived: false })
      .andWhere("allotment.status = :status", {
        status: DonationAllotmentStatus.PENDING,
      })
      .orderBy("allotment.created_at", "DESC");

    const isSuper = await this.isSuperAdmin(currentUser.id, currentUser.role);
    const isManager = await this.isFundRaisingManager(currentUser.id);

    if (!isSuper && !isManager) {
      qb.andWhere("allotment.approver_user_id = :userId", {
        userId: currentUser.id,
      });
    } else if (!isSuper && isManager) {
      qb.andWhere(
        "(allotment.approver_user_id = :userId OR allotment.approver_user_id IS NULL)",
        { userId: currentUser.id },
      );
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      ...this.serializeAllotment(row),
      donation: row.donation
        ? {
            id: row.donation.id,
            amount: row.donation.amount,
            paid_amount: row.donation.paid_amount,
            currency: row.donation.currency,
            donation_source: row.donation.donation_source,
            status: row.donation.status,
            donor_name: row.donation.donor?.name ?? null,
          }
        : null,
    }));
  }

  async countPendingForApprover(currentUser: AuthUser): Promise<number> {
    const rows = await this.listPendingForApprover(currentUser);
    return rows.length;
  }

  private async findOneById(id: number): Promise<DonationAllotment> {
    const allotment = await this.allotmentRepository.findOne({
      where: { id, is_archived: false },
      relations: [
        "requested_by",
        "credited_to",
        "approver",
        "decided_by",
        "donation",
      ],
    });
    if (!allotment) {
      throw new NotFoundException(`Allotment with ID ${id} not found`);
    }
    return allotment;
  }

  async approve(
    allotmentId: number,
    currentUser: AuthUser,
    dto: ReviewDonationAllotmentDto,
  ) {
    const allotment = await this.findOneById(allotmentId);
    if (allotment.status !== DonationAllotmentStatus.PENDING) {
      throw new BadRequestException("Only pending allotments can be approved");
    }
    await this.assertCanDecide(allotment, currentUser);

    const now = new Date();
    allotment.status = DonationAllotmentStatus.APPROVED;
    allotment.decided_by_user_id = currentUser.id;
    allotment.decided_at = now;
    allotment.decision_note = dto.decision_note?.trim() || null;
    allotment.updated_by = { id: currentUser.id } as User;
    await this.allotmentRepository.save(allotment);

    await this.donationRepository.update(allotment.donation_id, {
      credited_to_user_id: allotment.credited_to_user_id,
    });

    await this.allotmentRepository
      .createQueryBuilder()
      .update(DonationAllotment)
      .set({
        status: DonationAllotmentStatus.CANCELLED,
        decision_note: "Superseded by another approved allotment",
        decided_at: now,
        decided_by_user_id: currentUser.id,
      })
      .where("donation_id = :donationId", {
        donationId: allotment.donation_id,
      })
      .andWhere("id != :id", { id: allotment.id })
      .andWhere("status = :pending", {
        pending: DonationAllotmentStatus.PENDING,
      })
      .execute();

    await this.notifyRequesterOnDecision(allotment, "approved", currentUser);

    const loaded = await this.findOneById(allotment.id);
    return this.serializeAllotment(loaded);
  }

  async reject(
    allotmentId: number,
    currentUser: AuthUser,
    dto: ReviewDonationAllotmentDto,
  ) {
    const allotment = await this.findOneById(allotmentId);
    if (allotment.status !== DonationAllotmentStatus.PENDING) {
      throw new BadRequestException("Only pending allotments can be rejected");
    }
    await this.assertCanDecide(allotment, currentUser);

    allotment.status = DonationAllotmentStatus.REJECTED;
    allotment.decided_by_user_id = currentUser.id;
    allotment.decided_at = new Date();
    allotment.decision_note = dto.decision_note?.trim() || null;
    allotment.updated_by = { id: currentUser.id } as User;
    await this.allotmentRepository.save(allotment);

    await this.notifyRequesterOnDecision(allotment, "rejected", currentUser);

    const loaded = await this.findOneById(allotment.id);
    return this.serializeAllotment(loaded);
  }
}
