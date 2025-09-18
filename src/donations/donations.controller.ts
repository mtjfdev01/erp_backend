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
  UseGuards 
} from '@nestjs/common';
import { Response } from 'express';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { ConditionalJwtGuard } from '../auth/guards/conditional-jwt.guard';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../permissions/decorators/require-permission.decorator';

@Controller('donations')
@UseGuards(ConditionalJwtGuard, PermissionsGuard)
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

  @Get()
  // @RequiredPermissions(['donations.view', 'super_admin', 'fund_raising_manager'])
  async findAll(@Res() res: Response) {
    try {
      const result = await this.donationsService.findAll();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Donations retrieved successfully',
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
}
