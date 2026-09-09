import {
  Controller,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Get,
  Delete,
  UseGuards,
  HttpStatus,
  Res,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ComplaintsService } from "./complaints.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { UpdateComplaintDto } from "./dto/update-complaint.dto";
import { AssignComplaintDto } from "./dto/assign-complaint.dto";
import { ApproveComplaintDto } from "./dto/approve-complaint.dto";
import { AddAttachmentDto } from "./dto/add-attachment.dto";
import { AddCommentDto } from "./dto/add-comment.dto";
import { CreateComplaintDueReminderDto } from "./dto/create-complaint-due-reminder.dto";
import { TimeEntryDto } from "./dto/time-entry.dto";
import { UpdateComplaintProgressDto } from "./dto/update-complaint-progress.dto";
import { StatusTransitionDto } from "./dto/status-transition.dto";
import { ComplaintApprovalStateDto } from "./dto/complaint-approval-response.dto";
import { JwtGuard } from "../auth/jwt.guard";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../permissions";
import {
  COMPLAINT_CREATE_GUARD,
  COMPLAINT_LIST_VIEW_GUARD,
  COMPLAINT_VIEW_GUARD,
  COMPLAINT_UPDATE_GUARD,
  COMPLAINT_DELETE_GUARD,
  COMPLAINT_ASSIGN_GUARD,
  COMPLAINT_COMPLETE_GUARD,
  COMPLAINT_DASHBOARD_GUARD,
} from "../permissions/complaint-permissions.constants";
import { CurrentUser } from "../auth/current-user.decorator";
import { User, UserRole } from "../users/user.entity";
import { S3StorageService } from "../utils/storage/s3-storage.service";

const complaintAttachmentUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller("tickets")
@UseGuards(JwtGuard, PermissionsGuard)
export class ComplaintsController {
  constructor(
    private readonly complaintsService: ComplaintsService,
    private readonly s3Storage: S3StorageService,
  ) {}

  @Post()
  @RequiredPermissions([...COMPLAINT_CREATE_GUARD])
  async create(
    @Body() dto: CreateComplaintDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.create(dto, user);
    return res.status(HttpStatus.CREATED).json({ success: true, data: result });
  }

  @Post("search")
  @RequiredPermissions([...COMPLAINT_LIST_VIEW_GUARD])
  async findAll(
    @Body() payload: any,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.findAll(payload, user);
    return res.status(HttpStatus.OK).json({ success: true, ...result });
  }

  @Get("list")
  @RequiredPermissions([...COMPLAINT_LIST_VIEW_GUARD])
  async getComplaintList(
    @Query() query: any,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    // Convert query parameters to the same format as POST /complaints/search
    const payload = {
      pagination: {
        page: parseInt(query.page) || 1,
        pageSize: parseInt(query.pageSize) || 10,
        sortField: query.sortField || "created_at",
        sortOrder: (query.sortOrder || "DESC").toUpperCase(),
      },
      filters: {
        search: query.search || "",
        department: query.department || "",
        project_name: query.project_name || "",
        status: query.status || "",
        priority: query.priority || "",
        user_name: query.user_name || "",
        assignee_id: query.assignee_id || "",
        view_type: query.view_type || "",
      },
      strictDepartment: query.strictDepartment === "true" || false,
    };
    const result = await this.complaintsService.findAll(payload, user);
    return res.status(HttpStatus.OK).json({ success: true, ...result });
  }

  @Get("dashboard/stats")
  @RequiredPermissions([...COMPLAINT_DASHBOARD_GUARD])
  async getDashboardStats(
    @Query() query: any,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    // Pass user to service for role-based filtering
    const result = await this.complaintsService.getDashboardStats(query, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Get("reports")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD])
  async getReports(
    @Query() query: any,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    // Pass user to service for role-based filtering
    const result = await this.complaintsService.getReports(query, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Get(":id")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD])
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Query("include_all_mov") includeAllMov: string,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.findOne(+id, user, {
      filterMov: includeAllMov !== "true",
    });
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Get(":id/approval")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD])
  async getApprovalState(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const approval = await this.complaintsService.getApprovalStateForComplaint(+id, user);
    const data: ComplaintApprovalStateDto | null = approval
      ? {
          complaint_id: approval.complaint_id,
          approval_required_user_ids:
            approval.approval_required_user_ids ?? null,
          approvals_meta: (approval.approvals_meta as any) ?? null,
          approved_by_id: approval.approved_by_id ?? null,
          rejected_by_id: approval.rejected_by_id ?? null,
          approval_status: approval.approval_status ?? null,
          approved_note: (approval as any).approved_note ?? null,
          rejected_note: (approval as any).rejected_note ?? null,
          submission_note: (approval as any).submission_note ?? null,
        }
      : null;
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Patch(":id")
  @RequiredPermissions([...COMPLAINT_UPDATE_GUARD])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateComplaintDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.update(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/assign")
  @RequiredPermissions([...COMPLAINT_ASSIGN_GUARD])
  async assign(
    @Param("id") id: string,
    @Body() dto: AssignComplaintDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.assign(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/reassign")
  @RequiredPermissions([...COMPLAINT_ASSIGN_GUARD])
  async reassign(
    @Param("id") id: string,
    @Body() dto: AssignComplaintDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.reassign(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/approve")
  @RequiredPermissions([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DEPT_HEAD,
    UserRole.MANAGER,
    UserRole.USER,
    "complaints.complaints.view",
    "complaints.view",
  ])
  async approve(
    @Param("id") id: string,
    @Body() dto: ApproveComplaintDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.approve(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Get("approvals/my")
  async getMyApprovals(@CurrentUser() user: User, @Res() res: Response) {
    const approvals =
      await this.complaintsService.getApprovalsForUserDashboard(user);
    const data: ComplaintApprovalStateDto[] = approvals.map((approval) => ({
      complaint_id: approval.complaint_id,
      complaint: approval.complaint ?? null,
      approval_required_user_ids: approval.approval_required_user_ids ?? null,
      approvals_meta: (approval.approvals_meta as any) ?? null,
      approved_by_id: approval.approved_by_id ?? null,
      rejected_by_id: approval.rejected_by_id ?? null,
      approval_status: approval.approval_status ?? null,
      approved_note: (approval as any).approved_note ?? null,
      rejected_note: (approval as any).rejected_note ?? null,
      submission_note: (approval as any).submission_note ?? null,
    }));
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Post(":id/complete")
  @RequiredPermissions([...COMPLAINT_COMPLETE_GUARD])
  async complete(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.complete(+id, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/status-transition")
  @RequiredPermissions([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DEPT_HEAD,
    UserRole.MANAGER,
    UserRole.USER,
    "complaints.complaints.view",
    "complaints.view",
  ])
  async statusTransition(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.transitionStatus(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/attachments")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async addAttachment(
    @Param("id") id: string,
    @Body() dto: AddAttachmentDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.addAttachment(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/attachments/upload")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  @UseInterceptors(FileInterceptor("file", complaintAttachmentUploadOptions))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("description") description: string,
    @Body("name") name: string,
    @Body("is_initial") is_initial: any,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }
    const uploaded = await this.s3Storage.uploadComplaintAttachment(file);
    const attachmentName = String(description || name || "").trim() || undefined;
    const result = await this.complaintsService.addAttachment(
      +id,
      {
        file_name: file.originalname,
        file_url: uploaded.url,
        file_type: file.mimetype,
        description: attachmentName,
        is_initial: String(is_initial) === "true",
      },
      user,
    );
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Delete(":id/attachments/:attachmentId")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async removeAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.removeAttachment(
      +id,
      +attachmentId,
      user,
    );
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/comments")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async addComment(
    @Param("id") id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.addComment(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Get(":id/due-reminders")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async listDueReminders(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.listDueReminders(+id, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/due-reminders")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async createDueReminder(
    @Param("id") id: string,
    @Body() dto: CreateComplaintDueReminderDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.createDueReminder(+id, dto, user);
    return res
      .status(HttpStatus.CREATED)
      .json({ success: true, data: result });
  }

  @Delete(":id/due-reminders/:reminderId")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async deleteDueReminder(
    @Param("id") id: string,
    @Param("reminderId") reminderId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.deleteDueReminder(
      +id,
      +reminderId,
      user,
    );
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Delete(":id")
  @RequiredPermissions([...COMPLAINT_DELETE_GUARD, "admin"])
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.remove(+id, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Get(":id/work-history")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async getWorkHistory(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.getWorkHistory(+id, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/time-entries")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async addTimeEntry(
    @Param("id") id: string,
    @Body() dto: TimeEntryDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.addTimeEntry(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Patch(":id/progress")
  @RequiredPermissions([...COMPLAINT_UPDATE_GUARD])
  async updateProgress(
    @Param("id") id: string,
    @Body() dto: UpdateComplaintProgressDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.updateProgress(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Put(":id/progress")
  @RequiredPermissions([...COMPLAINT_VIEW_GUARD, ...COMPLAINT_UPDATE_GUARD])
  async replaceProgress(
    @Param("id") id: string,
    @Body() dto: UpdateComplaintProgressDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintsService.updateProgress(+id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }
}
