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
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DonationBoxService } from './donation-box.service';
import { CreateDonationBoxDto } from './dto/create-donation-box.dto';
import { UpdateDonationBoxDto } from './dto/update-donation-box.dto';
import { PermissionsGuard } from '../../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../../permissions/decorators/require-permission.decorator';
import { JwtGuard } from 'src/auth/jwt.guard';

@Controller('donation-box')
@UseGuards( JwtGuard,PermissionsGuard)
export class DonationBoxController {
  constructor(private readonly donationBoxService: DonationBoxService) {}

  @Post()
  @RequiredPermissions(['fund_raising.donation_box.create', 'super_admin', 'fund_raising_manager'])
  async create(@Body() createDonationBoxDto: CreateDonationBoxDto, @Res() res: Response) {
    try {
      const result = await this.donationBoxService.create(createDonationBoxDto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'Donation box created successfully',
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
  @RequiredPermissions(['fund_raising.donation_box.list_view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('search') search?: string,
    @Query('region') region?: string,
    @Query('city') city?: string,
    @Query('box_type') box_type?: string,
    @Query('status') status?: string,
    @Query('is_active') is_active?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Res() res?: Response,
  ) {
    try {
      const pageNum = page ? parseInt(page) : 1;
      const pageSizeNum = pageSize ? parseInt(pageSize) : 10;

      const result = await this.donationBoxService.findAll({
        page: pageNum,
        pageSize: pageSizeNum,
        sortField,
        sortOrder,
        search,
        region,
        city,
        box_type,
        status,
        is_active: is_active ? is_active === 'true' : undefined,
        start_date,
        end_date,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation box retrieved successfully',
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

  @Get('by-box-id/:box_id_no')
  @RequiredPermissions(['fund_raising.donation_box.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findByBoxIdNo(@Param('box_id_no') box_id_no: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxService.findByBoxIdNo(box_id_no);
      
      if (!result) {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: 'Donation box not found',
          data: null,
        });
      }
      
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation box retrieved successfully',
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Get('active-by-region/:region')
  @RequiredPermissions(['fund_raising.donation_box.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findActiveByRegion(@Param('region') region: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxService.findActiveByRegion(region);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Active donation box retrieved successfully',
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  @Get(':id')
  @RequiredPermissions(['fund_raising.donation_box.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation box retrieved successfully',
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
  @RequiredPermissions(['fund_raising.donation_box.update', 'super_admin', 'fund_raising_manager'])
  async update(
    @Param('id') id: string,
    @Body() updateDonationBoxDto: UpdateDonationBoxDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.donationBoxService.update(+id, updateDonationBoxDto);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation box updated successfully',
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
  @RequiredPermissions(['fund_raising.donation_box.delete', 'super_admin', 'fund_raising_manager'])
  async remove(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxService.remove(+id);
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

  @Post(':id/collection')
  @RequiredPermissions(['fund_raising.donation_box.update', 'super_admin', 'fund_raising_manager'])
  async updateCollection(
    @Param('id') id: string,
    @Body() collectionData: { amount: number },
    @Res() res: Response,
  ) {
    try {
      const result = await this.donationBoxService.updateCollectionStats(
        +id,
        collectionData.amount,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Collection statistics updated successfully',
        data: result,
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

