import { 
  Controller, 
  Get, 
  Query, 
  HttpStatus, 
  Res, 
  Post,
  Body,
  Param
} from '@nestjs/common';
import { Response } from 'express';
import { DonationsService } from './donations.service';
import { DonorService } from 'src/dms/donor/donor.service';


@Controller('donations/public')
export class PublicDonationsController {
  constructor(private readonly donationsService: DonationsService, private readonly donorService: DonorService) {}

  // Public PayFast IPN endpoint - NO GUARDS
  @Post('payfast/ipn')
  async handlePayfastIpn(@Body() payload: any, @Res() res: Response) {
    try {
      const result = await this.donationsService.handlePayfastIpn(payload);
      
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

  // Public Blinq callback endpoint - NO GUARDS
  @Post('blinq/callback')
  async handleBlinqCallback(@Body() payload: any, @Res() res: Response) {
    try {
      const result = await this.donationsService.handleBlinqCallback(payload);
      
      // Always return 200 OK as per Blinq documentation
      return res.status(HttpStatus.OK).json(result);
      
    } catch (error) {
      console.error("Blinq callback error:", error.message);
      
      // Still return 200 OK to prevent Blinq retries
      return res.status(HttpStatus.OK).json({ 
        code: "01",
        message: "Internal server error",
        status: "failure",
        invoice_number: payload.invoice_number || "unknown"
      });
    }
  }

  // Public endpoint to get failed transaction with donor information - NO GUARDS
  @Get('failed-transaction/:id')
  async getFailedTransaction(
    @Param('id') id: string,
    @Res() res: Response
  ) {
    try {
      const donation = await this.donationsService.findOne(+id);
      
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Failed transaction retrieved successfully',
        data: donation,
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
