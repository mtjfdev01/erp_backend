import { 
  Controller, 
  Get, 
  Query, 
  HttpStatus, 
  Res 
} from '@nestjs/common';
import { Response } from 'express';
import { DonationsService } from './donations.service';

@Controller('donations/public')
export class PublicDonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  // Public PayFast IPN endpoint - NO GUARDS
  @Get('payfast/ipn')
  async handlePayfastIpn(@Query() query: any, @Res() res: Response) {
    try {
      const result = await this.donationsService.handlePayfastIpn(query);
      
      return res.status(HttpStatus.OK).json({ 
        success: true, 
        message: 'IPN received successfully',
        basket_id: result.basket_id 
      });
      
    } catch (error) {
      console.error("IPN processing error:", error.message);
      
      // Still return 200 to prevent PayFast retries
      return res.status(HttpStatus.OK).json({ 
        success: false, 
        message: 'IPN processing error',
        error: error.message 
      });
    }
  }

  // Public endpoint to update donation status - NO GUARDS
  @Get('update-status')
  async updateDonationStatus(
    @Query('id') id: string,
    @Query('order_id') order_id: string,
    @Res() res: Response
  ) {
    try {
      const result = await this.donationsService.updateDonationFromPublic(id, order_id);
      
      return res.status(HttpStatus.OK).json({ 
        success: true, 
        message: 'Donation status updated successfully',
        data: result
      });
      
    } catch (error) {
      console.error("Update status error:", error.message);
      
      return res.status(HttpStatus.BAD_REQUEST).json({ 
        success: false, 
        message: 'Failed to update donation status',
        error: error.message 
      });
    }
  }
}
