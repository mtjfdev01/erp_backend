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
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { CsrPocsService } from "./csr-pocs.service";
import { CreateCsrPocDto } from "./dto/create-csr-poc.dto";
import { UpdateCsrPocDto } from "./dto/update-csr-poc.dto";
import { parseCsrPocListQuery } from "./utils/parse-csr-poc-list-query";
import { JwtGuard } from "../../auth/jwt.guard";
import { PermissionsGuard } from "../../permissions/guards/permissions.guard";
import { RequiredPermissions } from "../../permissions/decorators/require-permission.decorator";
import {
  CSR_POC_CREATE_GUARD,
  CSR_POC_DELETE_GUARD,
  CSR_POC_UPDATE_GUARD,
  CSR_POC_VIEW_GUARD,
} from "../../permissions/csr-poc-permissions.constants";

@Controller("csr-pocs")
@UseGuards(JwtGuard, PermissionsGuard)
export class CsrPocsController {
  constructor(private readonly csrPocsService: CsrPocsService) {}

  @Get()
  @RequiredPermissions([...CSR_POC_VIEW_GUARD])
  async listByCsrDonor(
    @Query("csr_donor_id") csrDonorId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const listParams = parseCsrPocListQuery(query);
    const result = await this.csrPocsService.findAll({
      ...listParams,
      csr_donor_id: csrDonorId ? +csrDonorId : undefined,
    });
    return res.status(HttpStatus.OK).json({
      success: true,
      data: result.data.map((row) => this.csrPocsService.mapPocForPeopleList(row)),
      pagination: result.pagination,
    });
  }

  @Get(":id")
  @RequiredPermissions([...CSR_POC_VIEW_GUARD])
  async findOne(@Param("id") id: string, @Res() res: Response) {
    const data = await this.csrPocsService.findOne(+id);
    return res.status(HttpStatus.OK).json({ success: true, data });
  }

  @Post()
  @RequiredPermissions([...CSR_POC_CREATE_GUARD])
  async create(
    @Body() dto: CreateCsrPocDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.csrPocsService.create(dto, req?.user);
    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: "POC created",
      data,
    });
  }

  @Patch(":id")
  @RequiredPermissions([...CSR_POC_UPDATE_GUARD])
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCsrPocDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const data = await this.csrPocsService.update(+id, dto, req?.user);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "POC updated",
      data,
    });
  }

  @Delete(":id")
  @RequiredPermissions([...CSR_POC_DELETE_GUARD])
  async remove(@Param("id") id: string, @Res() res: Response) {
    await this.csrPocsService.softDelete(+id);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: "POC archived",
    });
  }
}
