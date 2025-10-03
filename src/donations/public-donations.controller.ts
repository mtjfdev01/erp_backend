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
}
