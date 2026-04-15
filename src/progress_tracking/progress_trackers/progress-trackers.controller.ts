import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "src/auth/jwt.guard";
import { PermissionsGuard } from "src/permissions/guards/permissions.guard";
import { RequiredPermissions } from "src/permissions";
import { CurrentUser } from "src/auth/current-user.decorator";

import { ProgressTrackersService } from "./progress-trackers.service";
import { CreateTrackerDto } from "./dto/create-tracker.dto";
import { UpdateTrackerDto } from "./dto/update-tracker.dto";
import { UpdateTrackerStepStatusDto } from "./dto/update-tracker-step-status.dto";
import { AddEvidenceDto } from "./dto/add-evidence.dto";

@Controller("progress/trackers")
@UseGuards(JwtGuard, PermissionsGuard)
export class ProgressTrackersController {
  constructor(private readonly service: ProgressTrackersService) {}

  @Post()
  @RequiredPermissions([
    "fund_raising.donations.create",
    "super_admin",
    "fund_raising_manager",
  ])
  async create(
    @Body() dto: CreateTrackerDto,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.createTrackerFromTemplate(dto, user);
    return res
      .status(HttpStatus.CREATED)
      .json({ success: true, message: "Tracker created", data });
  }

  @Get()
  @RequiredPermissions([
    "fund_raising.donations.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("template_id") template_id?: string,
    @Query("donation_id") donation_id?: string,
    @Res() res?: Response,
  ) {
    const data = await this.service.listTrackers({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 10,
      search,
      template_id: template_id ? parseInt(template_id, 10) : undefined,
      donation_id: donation_id ? parseInt(donation_id, 10) : undefined,
    });
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Trackers retrieved", ...data });
  }

  @Get(":id")
  @RequiredPermissions([
    "fund_raising.donations.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async detail(@Param("id") id: string, @Res() res: Response) {
    const data = await this.service.getTrackerDetail(+id);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Tracker retrieved", data });
  }

  @Get("by-donation/:donationId")
  @RequiredPermissions([
    "fund_raising.donations.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async byDonation(
    @Param("donationId") donationId: string,
    @Res() res: Response,
  ) {
    const data = await this.service.getTrackerByDonationId(+donationId);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Tracker retrieved", data });
  }

  @Patch(":id")
  @RequiredPermissions([
    "fund_raising.donations.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTrackerDto,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.updateTracker(+id, dto, user);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Tracker updated", data });
  }

  @Post(":id/token")
  @RequiredPermissions([
    "fund_raising.donations.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async regenToken(
    @Param("id") id: string,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.generateOrRegenerateToken(+id, user);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Token generated", data });
  }

  @Get(":id/steps")
  @RequiredPermissions([
    "fund_raising.donations.view",
    "super_admin",
    "fund_raising_manager",
    "fund_raising_user",
  ])
  async listSteps(@Param("id") id: string, @Res() res: Response) {
    const data = await this.service.listSteps(+id);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Tracker steps retrieved", data });
  }

  @Patch("steps/:stepId")
  @RequiredPermissions([
    "fund_raising.donations.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async updateStep(
    @Param("stepId") stepId: string,
    @Body() dto: UpdateTrackerStepStatusDto,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.updateStep(+stepId, dto, user);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Tracker step updated", data });
  }

  @Post("steps/:stepId/evidence")
  @RequiredPermissions([
    "fund_raising.donations.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async addEvidence(
    @Param("stepId") stepId: string,
    @Body() dto: AddEvidenceDto,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.addEvidence(+stepId, dto, user);
    return res
      .status(HttpStatus.CREATED)
      .json({ success: true, message: "Evidence added", data });
  }

  @Patch("evidence/:evidenceId")
  @RequiredPermissions([
    "fund_raising.donations.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async updateEvidence(
    @Param("evidenceId") evidenceId: string,
    @Body() dto: Partial<AddEvidenceDto>,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.updateEvidence(+evidenceId, dto, user);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Evidence updated", data });
  }

  @Delete("evidence/:evidenceId")
  @RequiredPermissions([
    "fund_raising.donations.update",
    "super_admin",
    "fund_raising_manager",
  ])
  async archiveEvidence(
    @Param("evidenceId") evidenceId: string,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.archiveEvidence(+evidenceId, user);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Evidence archived", data });
  }
}

@Controller("progress/public")
export class ProgressPublicController {
  constructor(private readonly service: ProgressTrackersService) {}

  @Get(":token")
  async getPublic(@Param("token") token: string, @Res() res: Response) {
    const data = await this.service.getPublicTrackingByToken(token);
    return res
      .status(HttpStatus.OK)
      .json({ success: true, message: "Public tracking retrieved", data });
  }
}
