import { Controller, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // Simple endpoint: POST /whatsapp/hello
  @Post('hello')
  async sendHello(@Body() body: { to: string }) {
    // expects { to: "+923xxxxxxxxx" }
    return this.whatsappService.sendHello(body.to);
  }
}
