import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { JwtGuard } from "../auth/jwt.guard";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../permissions";
import { CurrentUser } from "../auth/current-user.decorator";
import { EmailChecklistService } from "./email-checklist.service";
import { ToggleChecklistItemDto } from "./dto/toggle-checklist-item.dto";
import { SaveGmailAppConfigDto } from "./dto/save-gmail-app-config.dto";
import { buildGmailOAuthRedirectUri } from "./gmail-oauth.util";

type AuthUser = { id: number; role?: string };

@Controller("email-checklist")
export class EmailChecklistController {
  constructor(private readonly service: EmailChecklistService) {}

  @Get("connection")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "communication.email_checklist.list_view",
    "super_admin",
  ])
  async getConnection(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const redirectUri = buildGmailOAuthRedirectUri(req);
    const data = await this.service.getConnectionStatus(user.id, redirectUri);
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Get("gmail/app-config")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions(["super_admin"])
  async getAppConfig(@Req() req: Request, @Res() res: Response) {
    const redirectUri = buildGmailOAuthRedirectUri(req);
    const data = await this.service.getAppConfig(redirectUri);
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Post("gmail/app-config")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions(["super_admin"])
  async saveAppConfig(
    @Body() dto: SaveGmailAppConfigDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const redirectUri = buildGmailOAuthRedirectUri(req);
      await this.service.saveAppConfig(
        dto.client_id,
        redirectUri,
        dto.client_secret,
      );
      const data = await this.service.getAppConfig(redirectUri);
      return res.status(HttpStatus.OK).json({
        success: true,
        data,
        message: "Google sign-in enabled for all users",
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to save Google app config",
      });
    }
  }

  @Get("gmail/auth-url")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "communication.email_checklist.update",
    "super_admin",
  ])
  async getAuthUrl(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const redirectUri = buildGmailOAuthRedirectUri(req);
      const frontendUrl =
        (typeof req.headers.origin === "string" && req.headers.origin) ||
        "http://localhost:5173";
      const data = await this.service.getGmailAuthUrl(
        user.id,
        redirectUri,
        frontendUrl,
      );
      return res.status(HttpStatus.OK).json({ success: true, data });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Failed to build Gmail auth URL",
      });
    }
  }

  @Get("gmail/callback")
  async gmailCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const redirectUri = buildGmailOAuthRedirectUri(req);

    if (error || !code || !state) {
      return res.redirect(`http://localhost:5173/email-checklist?gmail=error`);
    }

    try {
      const result = await this.service.handleOAuthCallback(
        code,
        state,
        redirectUri,
      );
      const base =
        result.frontendUrl?.replace(/\/$/, "") || "http://localhost:5173";
      const checklistUrl = `${base}/email-checklist`;
      return res.redirect(`${checklistUrl}?gmail=connected`);
    } catch (err: any) {
      const checklistUrl = `http://localhost:5173/email-checklist`;
      return res.redirect(
        `${checklistUrl}?gmail=error&message=${encodeURIComponent(err?.message || "OAuth failed")}`,
      );
    }
  }

  @Delete("gmail/disconnect")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "communication.email_checklist.update",
    "super_admin",
  ])
  async disconnect(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const data = await this.service.disconnectGmail(user.id);
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Get("items")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "communication.email_checklist.list_view",
    "super_admin",
  ])
  async listItems(
    @CurrentUser() user: AuthUser,
    @Query("show_done") showDone: string,
    @Res() res: Response,
  ) {
    const data = await this.service.listItems(
      user.id,
      showDone === "true" || showDone === "1",
    );
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Patch("items/:id")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "communication.email_checklist.update",
    "super_admin",
  ])
  async toggleItem(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ToggleChecklistItemDto,
    @Res() res: Response,
  ) {
    const data = await this.service.toggleItem(
      user.id,
      Number(id),
      dto.is_done,
    );
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Post("sync")
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequiredPermissions([
    "communication.email_checklist.list_view",
    "super_admin",
  ])
  async syncNow(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const redirectUri = buildGmailOAuthRedirectUri(req);
      const newCount = await this.service.syncUserInbox(user.id, redirectUri);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: { newCount },
        message:
          newCount > 0
            ? `${newCount} new email(s) added`
            : "Inbox is up to date",
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.message ||
        "Sync failed";
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message,
      });
    }
  }
}
