import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Get,
  UseGuards,
  HttpStatus,
  Res,
  ParseIntPipe,
} from "@nestjs/common";
import { Response } from "express";
import { ComplaintCaseService } from "./complaint-case.service";
import { CreateGeneralComplaintDto } from "./dto/create-general-complaint.dto";
import { UpdateComplaintCaseDto } from "./dto/update-complaint-case.dto";
import { ManageComplaintNomineesDto } from "./dto/manage-complaint-nominees.dto";
import { UpdateComplaintWorkflowStatusDto } from "./dto/update-complaint-workflow-status.dto";
import { UpdateComplaintNarrativesDto } from "./dto/update-complaint-narratives.dto";
import { CreateComplaintMeetingDto } from "./dto/create-complaint-meeting.dto";
import { UpdateComplaintMeetingDto } from "./dto/update-complaint-meeting.dto";
import { AddInvestigationLogDto } from "./dto/add-investigation-log.dto";
import { JwtGuard } from "../auth/jwt.guard";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../permissions";
import {
  COMPLAINT_CASE_CREATE_GUARD,
  COMPLAINT_CASE_LIST_VIEW_GUARD,
  COMPLAINT_CASE_VIEW_GUARD,
  COMPLAINT_CASE_INVESTIGATE_GUARD,
  COMPLAINT_CASE_UPDATE_STATUS_GUARD,
  COMPLAINT_CASE_MANAGE_NOMINEES_GUARD,
  COMPLAINT_CASE_SCHEDULE_MEETINGS_GUARD,
  COMPLAINT_CASE_ADD_NARRATIVE_GUARD,
} from "../permissions/complaint-case-permissions.constants";
import { CurrentUser } from "../auth/current-user.decorator";
import { User } from "../users/user.entity";

@Controller("tickets/case")
@UseGuards(JwtGuard, PermissionsGuard)
export class ComplaintCaseController {
  constructor(private readonly complaintCaseService: ComplaintCaseService) {}

  @Get("meta/categories")
  @RequiredPermissions([...COMPLAINT_CASE_VIEW_GUARD, ...COMPLAINT_CASE_CREATE_GUARD])
  getCategories(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      success: true,
      data: this.complaintCaseService.getCategories(),
    });
  }

  @Get("meta/statuses")
  @RequiredPermissions([...COMPLAINT_CASE_VIEW_GUARD, ...COMPLAINT_CASE_LIST_VIEW_GUARD])
  getStatuses(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      success: true,
      data: this.complaintCaseService.getWorkflowStatuses(),
    });
  }

  @Post()
  @RequiredPermissions([...COMPLAINT_CASE_CREATE_GUARD])
  async create(
    @Body() dto: CreateGeneralComplaintDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.create(dto, user);
    return res.status(HttpStatus.CREATED).json({ success: true, data: result });
  }

  @Post("search")
  @RequiredPermissions([...COMPLAINT_CASE_LIST_VIEW_GUARD])
  async findAll(
    @Body() payload: any,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.findAll(payload, user);
    return res.status(HttpStatus.OK).json({ success: true, ...result });
  }

  @Get(":id")
  @RequiredPermissions([...COMPLAINT_CASE_VIEW_GUARD])
  async findOne(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.findOne(id, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Patch(":id")
  @RequiredPermissions([...COMPLAINT_CASE_VIEW_GUARD])
  async updateCase(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateComplaintCaseDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.updateCase(id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Patch(":id/status")
  @RequiredPermissions([...COMPLAINT_CASE_UPDATE_STATUS_GUARD])
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateComplaintWorkflowStatusDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.updateWorkflowStatus(
      id,
      dto,
      user,
    );
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Patch(":id/nominees")
  @RequiredPermissions([...COMPLAINT_CASE_MANAGE_NOMINEES_GUARD])
  async manageNominees(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ManageComplaintNomineesDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.manageNominees(id, dto, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Patch(":id/narratives")
  @RequiredPermissions([...COMPLAINT_CASE_ADD_NARRATIVE_GUARD, ...COMPLAINT_CASE_VIEW_GUARD])
  async updateNarratives(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateComplaintNarrativesDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.updateNarratives(
      id,
      dto,
      user,
    );
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/investigation")
  @RequiredPermissions([...COMPLAINT_CASE_INVESTIGATE_GUARD])
  async addInvestigationLog(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AddInvestigationLogDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.addInvestigationLog(
      id,
      dto,
      user,
    );
    return res.status(HttpStatus.CREATED).json({ success: true, data: result });
  }

  @Get(":id/meetings")
  @RequiredPermissions([...COMPLAINT_CASE_VIEW_GUARD])
  async listMeetings(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.listMeetings(id, user);
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  @Post(":id/meetings")
  @RequiredPermissions([...COMPLAINT_CASE_SCHEDULE_MEETINGS_GUARD])
  async createMeeting(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateComplaintMeetingDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.createMeeting(id, dto, user);
    return res.status(HttpStatus.CREATED).json({ success: true, data: result });
  }

  @Patch(":id/meetings/:meetingId")
  @RequiredPermissions([...COMPLAINT_CASE_SCHEDULE_MEETINGS_GUARD])
  async updateMeeting(
    @Param("id", ParseIntPipe) id: number,
    @Param("meetingId", ParseIntPipe) meetingId: number,
    @Body() dto: UpdateComplaintMeetingDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const result = await this.complaintCaseService.updateMeeting(
      id,
      meetingId,
      dto,
      user,
    );
    return res.status(HttpStatus.OK).json({ success: true, data: result });
  }
}
