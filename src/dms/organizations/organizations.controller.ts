import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  Res,
  Req,
} from "@nestjs/common";
import { Response } from "express";
import { OrganizationsService } from "./organizations.service";
import { CsrPocsService } from "./csr-pocs.service";
import { CreateCsrPocDto } from "./dto/create-csr-poc.dto";
import { UpdateCsrPocDto } from "./dto/update-csr-poc.dto";
import { parseCsrPocListQuery } from "./utils/parse-csr-poc-list-query";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { CreateAffiliationDto } from "./dto/create-affiliation.dto";
import { CreateOrganizationBranchDto } from "./dto/create-organization-branch.dto";
import { UpdateOrganizationBranchDto } from "./dto/update-organization-branch.dto";
import { ChangePipelineStageDto } from "../donor/dto/change-pipeline-stage.dto";
import { JwtGuard } from "../../auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import {
  ORGANIZATION_CREATE_GUARD,
  ORGANIZATION_DELETE_GUARD,
  ORGANIZATION_LIST_GUARD,
  ORGANIZATION_UPDATE_GUARD,
  ORGANIZATION_VIEW_GUARD,
} from "../../permissions/organization-permissions.constants";
import {
  CSR_POC_CREATE_GUARD,
  CSR_POC_DELETE_GUARD,
  CSR_POC_UPDATE_GUARD,
  CSR_POC_VIEW_GUARD,
} from "../../permissions/csr-poc-permissions.constants";

@Controller(["csr-donors", "organizations"])
@UseGuards(JwtGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly csrPocsService: CsrPocsService,
  ) {}

  @Post()
  @RequiredPermissions([...ORGANIZATION_CREATE_GUARD])
  async create(
    @Body() dto: CreateOrganizationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.create(dto, req?.user);
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Organization created",
      data,
    });
  }

  @Get()
  @RequiredPermissions([...ORGANIZATION_LIST_GUARD])
  async findAll(
    @Query("search") search: string,
    @Query("city") city: string,
    @Query("is_active") isActive: string,
    @Query("page") page: string,
    @Query("pageSize") pageSize: string,
    @Res() res: Response,
  ) {
    const activeFilter =
      isActive === "true" ? true : isActive === "false" ? false : undefined;
    const result = await this.organizationsService.findAll({
      search,
      city,
      is_active: activeFilter,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Organizations retrieved",
      ...result,
    });
  }

  @Post("affiliations")
  @RequiredPermissions([...ORGANIZATION_CREATE_GUARD, ...ORGANIZATION_UPDATE_GUARD])
  async createAffiliation(
    @Body() dto: CreateAffiliationDto,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.createAffiliation(dto);
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Affiliation created",
      data,
    });
  }

  @Get("affiliations/donor/:donorId")
  @RequiredPermissions([...ORGANIZATION_VIEW_GUARD])
  async listForDonor(
    @Param("donorId") donorId: string,
    @Res() res: Response,
  ) {
    const data =
      await this.organizationsService.listAffiliationsForDonor(+donorId);
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Get(":id/people")
  @RequiredPermissions([...CSR_POC_VIEW_GUARD])
  async listPeople(
    @Param("id") id: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.listPeopleForOrganization(
      +id,
      parseCsrPocListQuery(query),
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Organization POCs retrieved",
      data,
    });
  }

  @Get(":id/pocs")
  @RequiredPermissions([...CSR_POC_VIEW_GUARD])
  async listPocs(
    @Param("id") id: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const result = await this.csrPocsService.findAll({
      ...parseCsrPocListQuery(query),
      csr_donor_id: +id,
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "POCs retrieved",
      data: result.data.map((row) => this.csrPocsService.mapPocForPeopleList(row)),
      pagination: result.pagination,
    });
  }

  @Post(":id/pocs")
  @RequiredPermissions([...CSR_POC_CREATE_GUARD])
  async createPoc(
    @Param("id") id: string,
    @Body() body: Omit<CreateCsrPocDto, "csr_donor_id">,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.csrPocsService.create(
      { ...body, csr_donor_id: +id },
      req?.user,
    );
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "POC created",
      data,
    });
  }

  @Patch(":id/pocs/:pocId")
  @RequiredPermissions([...CSR_POC_UPDATE_GUARD])
  async updatePoc(
    @Param("id") id: string,
    @Param("pocId") pocId: string,
    @Body() dto: UpdateCsrPocDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const poc = await this.csrPocsService.findOne(+pocId);
    if (poc.csr_donor_id !== +id) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "POC does not belong to this CSR donor",
      });
    }
    const data = await this.csrPocsService.update(+pocId, dto, req?.user);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "POC updated",
      data,
    });
  }

  @Delete(":id/pocs/:pocId")
  @RequiredPermissions([...CSR_POC_DELETE_GUARD])
  async deletePoc(
    @Param("id") id: string,
    @Param("pocId") pocId: string,
    @Res() res: Response,
  ) {
    const poc = await this.csrPocsService.findOne(+pocId);
    if (poc.csr_donor_id !== +id) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "POC does not belong to this CSR donor",
      });
    }
    await this.csrPocsService.softDelete(+pocId);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "POC archived",
    });
  }

  @Get(":id/pipeline-history")
  @RequiredPermissions([...ORGANIZATION_VIEW_GUARD])
  async getPipelineHistory(@Param("id") id: string, @Res() res: Response) {
    const data = await this.organizationsService.getPipelineHistory(+id);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "CSR donor pipeline history retrieved",
      data,
    });
  }

  @Post(":id/pipeline-stage")
  @RequiredPermissions([...ORGANIZATION_UPDATE_GUARD])
  async changePipelineStage(
    @Param("id") id: string,
    @Body() dto: ChangePipelineStageDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.changePipelineStage(
      +id,
      dto,
      req?.user,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Pipeline stage updated successfully",
      data,
    });
  }

  @Get(":id/audit-history")
  @RequiredPermissions([...ORGANIZATION_VIEW_GUARD])
  async getAuditHistory(@Param("id") id: string, @Res() res: Response) {
    const data = await this.organizationsService.getAuditHistory(+id);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "CSR donor audit history retrieved",
      data,
    });
  }

  @Get(":id")
  @RequiredPermissions([...ORGANIZATION_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    const data = await this.organizationsService.findOne(+id);
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Patch(":id")
  @RequiredPermissions([...ORGANIZATION_UPDATE_GUARD])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateOrganizationDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.update(+id, dto, req?.user);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Organization updated",
      data,
    });
  }

  @Delete(":id")
  @RequiredPermissions([...ORGANIZATION_DELETE_GUARD])
  async remove(@Param("id") id: string, @Res() res: Response) {
    await this.organizationsService.softDelete(+id);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Organization archived",
    });
  }

  @Post(":id/branches")
  @RequiredPermissions([...ORGANIZATION_CREATE_GUARD, ...ORGANIZATION_UPDATE_GUARD])
  async createBranch(
    @Param("id") id: string,
    @Body() body: CreateOrganizationBranchDto,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.createBranch(+id, body);
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: body.parent_branch_id ? "Sub-branch created" : "Branch created",
      data,
    });
  }

  @Patch(":id/branches/:branchId")
  @RequiredPermissions([...ORGANIZATION_UPDATE_GUARD])
  async updateBranch(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Body() body: UpdateOrganizationBranchDto,
    @Res() res: Response,
  ) {
    const data = await this.organizationsService.updateBranch(
      +id,
      +branchId,
      body,
    );
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Branch updated",
      data,
    });
  }

  @Delete(":id/branches/:branchId")
  @RequiredPermissions([...ORGANIZATION_DELETE_GUARD, ...ORGANIZATION_UPDATE_GUARD])
  async deleteBranch(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Res() res: Response,
  ) {
    await this.organizationsService.softDeleteBranch(+id, +branchId);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "Branch archived",
    });
  }
}
