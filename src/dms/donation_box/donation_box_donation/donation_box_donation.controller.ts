import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  Res,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { DonationBoxDonationService } from './donation_box_donation.service';
import { CreateDonationBoxDonationDto } from './dto/create-donation_box_donation.dto';
import { UpdateDonationBoxDonationDto } from './dto/update-donation_box_donation.dto';
import { PermissionsGuard } from '../../../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../../../permissions/decorators/require-permission.decorator';
import { JwtGuard } from 'src/auth/jwt.guard';

@Controller('donation-box-donation')
@UseGuards(JwtGuard, PermissionsGuard)
export class DonationBoxDonationController {
  constructor(
    private readonly donationBoxDonationService: DonationBoxDonationService,
  ) {}

  @Post()
  @RequiredPermissions([
    'fund_raising.donation_box_donations.create', 'super_admin','fund_raising_manager',
  ])
  async create(
    @Body() createDonationBoxDonationDto: CreateDonationBoxDonationDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const currentUserId = req.user?.id;
      const result = await this.donationBoxDonationService.create(
        createDonationBoxDonationDto,
        currentUserId,
      );
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'Collection recorded successfully',
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

  @Get()
  @RequiredPermissions(['fund_raising.donation_box_donations.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('search') search?: string,
    @Query('donation_box_id') donation_box_id?: string,
    @Query('status') status?: string,
    @Query('payment_method') payment_method?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Res() res?: Response,
  ) {
    try {
      const pageNum = page ? parseInt(page) : 1;
      const pageSizeNum = pageSize ? parseInt(pageSize) : 10;

      const result = await this.donationBoxDonationService.findAll({
        page: pageNum,
        pageSize: pageSizeNum,
        sortField,
        sortOrder,
        search,
        donation_box_id: donation_box_id ? parseInt(donation_box_id) : undefined,
        status,
        payment_method,
        start_date,
        end_date,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Collection records retrieved successfully',
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

  @Get('box/:boxId')
  @RequiredPermissions([ 'fund_raising.donation_box_donations.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findByDonationBox(@Param('boxId') boxId: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxDonationService.findByDonationBox(
        +boxId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Collections retrieved successfully',
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

  @Get('box/:boxId/stats')
  @RequiredPermissions([ 'fund_raising.donation_box_donations.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async getBoxCollectionStats(
    @Param('boxId') boxId: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.donationBoxDonationService.getBoxCollectionStats(
        +boxId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Collection statistics retrieved successfully',
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

  @Get(':id')
  @RequiredPermissions([ 'fund_raising.donation_box_donations.view', 'super_admin','fund_raising_manager', 'fund_raising_user'])
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxDonationService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Collection record retrieved successfully',
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
  @RequiredPermissions(['fund_raising.donation_box_donations.update', 'super_admin', 'fund_raising_manager',])
  async update(
    @Param('id') id: string,
    @Body() updateDonationBoxDonationDto: UpdateDonationBoxDonationDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    try {
      const currentUserId = req.user?.id;
      const result = await this.donationBoxDonationService.update(
        +id,
        updateDonationBoxDonationDto,
        currentUserId,
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Collection record updated successfully',
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
  @RequiredPermissions([ 'fund_raising.donation_box_donations.delete', 'super_admin', 'fund_raising_manager',])
  async remove(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donationBoxDonationService.remove(+id);
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
}
