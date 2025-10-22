import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DonorService } from './donor.service';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
// import { ChangePasswordDto } from './dto/change-password.dto';
import { ConditionalJwtGuard } from '../../auth/guards/conditional-jwt.guard';
import { PermissionsGuard } from '../../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../../permissions/decorators/require-permission.decorator';

@Controller('donors')
@UseGuards(ConditionalJwtGuard, PermissionsGuard)
export class DonorController {
  constructor(private readonly donorService: DonorService) {}

  @Post('register') 
  @RequiredPermissions(['fund_raising.donors.create', 'super_admin', 'fund_raising_manager'])
  async register(@Body() createDonorDto: CreateDonorDto, @Req() req: any, @Res() res: Response) {
    try {
      const user = req?.user ?? null;
      const result = await this.donorService.register(createDonorDto, user);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'Donor registered successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('already exists')
        ? HttpStatus.CONFLICT
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Get()
  @RequiredPermissions(['fund_raising.donors.list_view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('search') search?: string,
    @Query('donor_type') donor_type?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('is_active') is_active?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Res() res?: Response,
  ) {
    try {
      const pageNum = page ? parseInt(page) : 1;
      const pageSizeNum = pageSize ? parseInt(pageSize) : 10;

      const result = await this.donorService.findAll({
        page: pageNum,
        pageSize: pageSizeNum,
        sortField,
        sortOrder,
        search,
        donor_type,
        city,
        country,
        is_active: is_active ? is_active === 'true' : undefined,
        start_date,
        end_date,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donors retrieved successfully',
        ...result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
        pagination: null,
      });
    }
  }

  @Get(':id')
  @RequiredPermissions(['fund_raising.donors.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donorService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donor retrieved successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Patch(':id')
  @RequiredPermissions(['fund_raising.donors.update', 'super_admin', 'fund_raising_manager'])
  async update(
    @Param('id') id: string,
    @Body() updateDonorDto: UpdateDonorDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.donorService.update(+id, updateDonorDto);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donor updated successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Delete(':id')
  @RequiredPermissions(['fund_raising.donors.delete', 'super_admin', 'fund_raising_manager'])
  async remove(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    try {
       
      const result = await this.donorService.remove(+id, req.user);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
        data: null,
      });
    } catch (error) {
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Post(':id/change-password')
  @RequiredPermissions(['fund_raising.donors.update', 'super_admin', 'fund_raising_manager'])
  async changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.donorService.changePassword(
        +id,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result.message,
        data: null,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }
}
