import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('check-outbound-ip')
  async checkOutboundIP() {
    try {
      // This will show the IP that external services see
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      return {
        outboundIP: data.ip,  // This is what you need for Google Workspace
        message: 'Add this IP to Google Workspace whitelist',
        note: 'Railway IPs can change, consider using App Passwords instead',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return { 
        error: 'Failed to get IP',
        message: error?.message || 'Unknown error'
      };
    }
  }
}
