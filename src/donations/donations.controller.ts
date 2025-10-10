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
  Query
} from '@nestjs/common';
import { FilterPayload, applyHybridFilters, HybridFilter } from '../utils/filters/common-filter.util';
import { Response } from 'express';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
// import { ConditionalJwtGuard } from '../auth/guards/conditional-jwt.guard';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../permissions/decorators/require-permission.decorator';

@Controller('donations')
@UseGuards( PermissionsGuard)
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post()
  // @RequiredPermissions(['donations.create', 'super_admin', 'fund_raising_manager'])
  async create(@Body() createDonationDto: CreateDonationDto, @Res() res: Response) {
    try {
      console.log("donation api called________________________");
      const result = await this.donationsService.create(createDonationDto);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'Donation created successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Post('search')
  // @RequiredPermissions(['donations.view', 'super_admin', 'fund_raising_manager', 'fund_raising_user'])
  async findAll(@Body() payload: any, @Res() res: Response) {
    try {
      console.log("Donations search payload:", JSON.stringify(payload, null, 2));
      
      // Extract pagination and sorting
      const pagination = payload.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const sortField = pagination.sortField || 'created_at';
      const sortOrder = pagination.sortOrder || 'DESC';
      
      // Extract filters
      const filters = payload.filters || {};
      
      // Extract hybrid filters and convert to new format
      const hybridFilters = payload.hybrid_filters || [];
      
      // Build complete filters object
      const completeFilters: FilterPayload = {
        ...filters
      };
      
      console.log("Processed filters:", JSON.stringify(completeFilters, null, 2));
      console.log("Hybrid filters:", JSON.stringify(hybridFilters, null, 2));
      
      const result = await this.donationsService.findAll(page, pageSize, sortField, sortOrder, completeFilters, hybridFilters);
      
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donations retrieved successfully',
        ...result,
      });
    } catch (error) {
      console.error("Donations search error:", error);
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
        pagination: null,
      });
    }
  }

  @Get(':id')
  // @RequiredPermissions(['donations.view', 'super_admin', 'fund_raising_manager'])
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donationsService.findOne(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation retrieved successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Patch(':id')
  // @RequiredPermissions(['donations.update', 'super_admin', 'fund_raising_manager'])
  async update(@Param('id') id: string, @Body() updateDonationDto: UpdateDonationDto, @Res() res: Response) {
    try {
      const result = await this.donationsService.update(+id, updateDonationDto);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation updated successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Delete(':id')
  //  @RequiredPermissions(['donations.delete', 'super_admin', 'fund_raising_manager'])
  async remove(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.donationsService.remove(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation deleted successfully',
        data: result,
      });
    } catch (error) {
      const status = error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  @Post('status')
  async updateDonationStatus(@Body() payload: any, @Res() res: Response) {
    try {
      console.log("Donation status update payload:", payload);
      
      const result = await this.donationsService.updateDonationFromPublic(payload.id, payload.order_id);
      
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donation status updated successfully',
        data: result,
      });
    } catch (error) {
      console.error("Error updating donation status:", error);
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

}
