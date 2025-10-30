import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  async sendHello(to: string): Promise<any> {
    // NOTE: Replace the following with your actual tokens and WhatsApp Cloud API params
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'YOUR_WA_TOKEN';
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'YOUR_PHONE_NUMBER_ID';
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    try {
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: 'hello' }
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (err) {
      return {
        error: true,
        message: err?.response?.data || err.message,
      };
    }
  }
}
