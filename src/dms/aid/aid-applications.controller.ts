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
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { JwtGuard } from "../../auth/jwt.guard";
import {
  AID_APPLICATIONS_APPROVE_DRAFT_GUARD,
  AID_APPLICATIONS_CEO_GUARD,
  AID_APPLICATIONS_CREATE_GUARD,
  AID_APPLICATIONS_DELETE_GUARD,
  AID_APPLICATIONS_DELIVER_GUARD,
  AID_APPLICATIONS_LIST_GUARD,
  AID_APPLICATIONS_UPDATE_GUARD,
  AID_APPLICATIONS_VIEW_GUARD,
  AID_PEOPLE_UPDATE_GUARD,
  AID_PEOPLE_VIEW_GUARD,
} from "../../permissions/aid-permissions.constants";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { AidAttachmentContext } from "./aid.enums";
import { AidApplicationsService } from "./aid-applications.service";
import {
  ApproveDraftAidApplicationDto,
  CeoDecideAidApplicationDto,
  CreateAidApplicationDto,
  DeliverAidApplicationDto,
  ManagerForwardAidApplicationDto,
  MarkIncompleteAidApplicationDto,
  RejectAidApplicationDto,
  SetAidAttachmentMissingDto,
  SetAidMissingDocumentsDto,
  UpdateAidApplicationDto,
  VerifyAidApplicationDto,
} from "./dto/aid.dto";

const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller("aid/applications")
@UseGuards(JwtGuard, PermissionsGuard)
export class AidApplicationsController {
  constructor(private readonly applicationsService: AidApplicationsService) {}

  @Post()
  @RequiredPermissions([...AID_APPLICATIONS_CREATE_GUARD])
  async create(
    @Body() dto: CreateAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.create(dto, req?.user);
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Application saved as draft",
      data,
    });
  }

  @Get()
  @RequiredPermissions([...AID_APPLICATIONS_LIST_GUARD])
  async findAll(
    @Query("search") search: string,
    @Query("status") status: string,
    @Query("stage") stage: string,
    @Query("requested_aid_type") requested_aid_type: string,
    @Query("district") district: string,
    @Query("assigned_to_user_id") assigned_to_user_id: string,
    @Query("queue") queue: string,
    @Query("page") page: string,
    @Query("pageSize") pageSize: string,
    @Query("sortField") sortField: string,
    @Query("sortOrder") sortOrder: string,
    @Res() res: Response,
  ) {
    const result = await this.applicationsService.findAll({
      search,
      status,
      stage,
      requested_aid_type,
      district,
      assigned_to_user_id,
      queue,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      sortField,
      sortOrder,
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Applications retrieved",
      ...result,
    });
  }

  @Post("documents/upload")
  @RequiredPermissions([
    ...AID_APPLICATIONS_CREATE_GUARD,
    ...AID_APPLICATIONS_UPDATE_GUARD,
    ...AID_PEOPLE_UPDATE_GUARD,
  ])
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async uploadLooseDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body("context") context: string,
    @Res() res: Response,
  ) {
    if (!file) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "file is required",
      });
    }
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    const allowedMime = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    const allowedExt = /\.(jpe?g|png|webp)$/;
    if (!allowedMime.has(mime) && !allowedExt.test(name)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Only JPG, JPEG, PNG, or WEBP images are allowed",
      });
    }
    const data = await this.applicationsService.uploadLooseDocument(
      file,
      context || "necta",
    );
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Document uploaded",
      data,
    });
  }

  @Get("person/:personId/attachments")
  @RequiredPermissions([...AID_PEOPLE_VIEW_GUARD])
  async personAttachments(
    @Param("personId") personId: string,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.listPersonAttachments(
      Number(personId),
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Attachments retrieved",
      data,
    });
  }

  @Post("person/:personId/attachments/upload")
  @RequiredPermissions([...AID_PEOPLE_UPDATE_GUARD])
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async uploadPersonAttachment(
    @Param("personId") personId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("context") context: string,
    @Body("description") description: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    if (!file) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "file is required",
      });
    }
    const ctx = (Object.values(AidAttachmentContext) as string[]).includes(
      context,
    )
      ? (context as AidAttachmentContext)
      : AidAttachmentContext.PROFILE;

    const data = await this.applicationsService.addAttachment({
      applicationId: null,
      personId: Number(personId),
      context: ctx,
      file,
      description,
      user: req?.user,
    });
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Attachment uploaded",
      data,
    });
  }

  @Delete("attachments/:attachmentId")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async deleteAttachment(
    @Param("attachmentId") attachmentId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.deleteAttachment(
      Number(attachmentId),
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Attachment removed",
      data,
    });
  }

  @Patch("attachments/:attachmentId/missing")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async setAttachmentMissing(
    @Param("attachmentId") attachmentId: string,
    @Body() dto: SetAidAttachmentMissingDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.setAttachmentMissing(
      Number(attachmentId),
      !!dto?.is_missing,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: dto?.is_missing
        ? "Attachment marked missing; status set to Incomplete Docs"
        : "Attachment missing flag cleared",
      data,
    });
  }

  @Patch(":id/missing-documents")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async setMissingDocuments(
    @Param("id") id: string,
    @Body() dto: SetAidMissingDocumentsDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.setMissingDocuments(
      Number(id),
      dto?.missing_documents || [],
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message:
        (dto?.missing_documents || []).length > 0
          ? "Missing documents updated; status set to Incomplete Docs"
          : "Missing documents cleared",
      data,
    });
  }

  /** Selection lookup — authenticated only (no module permissions), same as /users/lookup. */
  @Get("lookup")
  async lookup(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.applicationsService.listForLookup({
        search,
        limit: limit ? parseInt(limit, 10) : undefined,
        activeOnly:
          activeOnly === "true" || activeOnly === "1"
            ? true
            : activeOnly === "false" || activeOnly === "0"
              ? false
              : undefined,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: "Lookup retrieved successfully",
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error?.message || "Lookup failed",
        data: [],
      });
    }
  }

  @Get(":id")
  @RequiredPermissions([...AID_APPLICATIONS_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid application id",
        data: null,
      });
    }
    const data = await this.applicationsService.findOne(numId);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Application retrieved",
      data,
    });
  }

  @Patch(":id")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.update(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Application updated",
      data,
    });
  }

  @Post(":id/approve-draft")
  @RequiredPermissions([...AID_APPLICATIONS_APPROVE_DRAFT_GUARD])
  async approveDraft(
    @Param("id") id: string,
    @Body() dto: ApproveDraftAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.approveDraft(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message:
        "Draft approved and assigned — application submitted for verification",
      data,
    });
  }

  @Post(":id/reject")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async reject(
    @Param("id") id: string,
    @Body() dto: RejectAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.reject(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Application rejected",
      data,
    });
  }

  @Post(":id/mark-incomplete")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async markIncomplete(
    @Param("id") id: string,
    @Body() dto: MarkIncompleteAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.markIncomplete(
      Number(id),
      dto || {},
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Application marked incomplete",
      data,
    });
  }

  @Post(":id/resume-incomplete")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async resumeIncomplete(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.resumeIncomplete(
      Number(id),
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Incomplete application resumed for verification",
      data,
    });
  }

  @Post(":id/verify")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async verify(
    @Param("id") id: string,
    @Body() dto: VerifyAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.markVerified(
      Number(id),
      dto,
      req?.user,
    );
    const awaitingManager = data?.status === "manager_review";
    return res.status(HttpStatus.OK).json({
      success: true,
      message: awaitingManager
        ? "Verification recorded — awaiting Manager Review"
        : "Verification recorded — awaiting CEO approval",
      data,
    });
  }

  @Post(":id/manager-forward")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  async managerForward(
    @Param("id") id: string,
    @Body() dto: ManagerForwardAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.managerForward(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Forwarded for CEO approval",
      data,
    });
  }

  @Post(":id/ceo-decide")
  @RequiredPermissions([...AID_APPLICATIONS_CEO_GUARD])
  async ceoDecide(
    @Param("id") id: string,
    @Body() dto: CeoDecideAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.ceoDecide(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "CEO decision recorded",
      data,
    });
  }

  @Post(":id/delivery")
  @RequiredPermissions([...AID_APPLICATIONS_DELIVER_GUARD])
  async delivery(
    @Param("id") id: string,
    @Body() dto: DeliverAidApplicationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.applicationsService.markDelivery(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Delivery status updated",
      data,
    });
  }

  @Post(":id/attachments/upload")
  @RequiredPermissions([...AID_APPLICATIONS_UPDATE_GUARD])
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("context") context: string,
    @Body("description") description: string,
    @Body("person_id") personId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    if (!file) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "file is required",
      });
    }
    const ctx = (Object.values(AidAttachmentContext) as string[]).includes(
      context,
    )
      ? (context as AidAttachmentContext)
      : AidAttachmentContext.VERIFICATION;

    const data = await this.applicationsService.addAttachment({
      applicationId: Number(id),
      personId: personId ? Number(personId) : null,
      context: ctx,
      file,
      description,
      user: req?.user,
    });
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Attachment uploaded",
      data,
    });
  }

  @Delete(":id")
  @RequiredPermissions([...AID_APPLICATIONS_DELETE_GUARD])
  async remove(@Param("id") id: string, @Req() req: any, @Res() res: Response) {
    const data = await this.applicationsService.softDelete(Number(id), req?.user);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Application archived",
      data,
    });
  }
}