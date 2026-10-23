import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtGuard } from "../../auth/jwt.guard";
import {
  AID_DISBURSEMENTS_CREATE_GUARD,
  AID_DISBURSEMENTS_DELIVER_GUARD,
  AID_DISBURSEMENTS_LIST_GUARD,
  AID_DISBURSEMENTS_VIEW_GUARD,
} from "../../permissions/aid-permissions.constants";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { AidDisbursementsService } from "./aid-disbursements.service";
import {
  CreateAidDisbursementPlanDto,
  RecordAidDisbursementDeliveryDto,
  UpdateAidDisbursementStatusDto,
} from "./dto/aid.dto";

@Controller("aid/disbursements")
@UseGuards(JwtGuard, PermissionsGuard)
export class AidDisbursementsController {
  constructor(private readonly disbursementsService: AidDisbursementsService) {}

  @Get()
  @RequiredPermissions([...AID_DISBURSEMENTS_LIST_GUARD])
  async list(@Query() query: Record<string, string>, @Req() req: any, @Res() res: Response) {
    const data = await this.disbursementsService.findAll(query, req?.user);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Disbursements fetched",
      ...data,
    });
  }

  @Get("by-application/:applicationId")
  @RequiredPermissions([...AID_DISBURSEMENTS_VIEW_GUARD])
  async byApplication(
    @Param("applicationId") applicationId: string,
    @Res() res: Response,
  ) {
    const data = await this.disbursementsService.findByApplication(
      Number(applicationId),
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Application disbursements fetched",
      ...data,
    });
  }

  @Get(":id")
  @RequiredPermissions([...AID_DISBURSEMENTS_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    const data = await this.disbursementsService.findOne(Number(id));
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Disbursement fetched",
      data,
    });
  }

  @Post("ensure")
  @RequiredPermissions([...AID_DISBURSEMENTS_CREATE_GUARD])
  async ensurePlan(
    @Body() dto: CreateAidDisbursementPlanDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.disbursementsService.createPlan(dto, req?.user);
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Disbursement plan ready",
      ...data,
    });
  }

  @Post(":id/deliver")
  @RequiredPermissions([...AID_DISBURSEMENTS_DELIVER_GUARD])
  async deliver(
    @Param("id") id: string,
    @Body() dto: RecordAidDisbursementDeliveryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.disbursementsService.recordDelivery(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Delivery recorded",
      data,
    });
  }

  @Patch(":id/status")
  @RequiredPermissions([...AID_DISBURSEMENTS_DELIVER_GUARD])
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateAidDisbursementStatusDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.disbursementsService.updateStatus(
      Number(id),
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Disbursement status updated",
      data,
    });
  }
}
