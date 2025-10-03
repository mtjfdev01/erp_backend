import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
    this.validateConfiguration();
  }

  private initializeTransporter() {
    const host = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PORT', '587'));
    const secure = String(this.configService.get('GOOGLE_WORKSPACE_SMTP_SECURE', 'false')) === 'true';
    const user = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'donations@mtjfoundation.com');
    const pass = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PASSWORD', '');
    const rejectUnauthorized = String(this.configService.get('GOOGLE_WORKSPACE_SMTP_TLS_REJECT_UNAUTHORIZED', 'true')) === 'true';

    console.log(
      "host", host,
      "port", port,
      "secure", secure,
      "user", user,
      "pass", pass,
      "rejectUnauthorized", rejectUnauthorized
    )
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // false for 587 (STARTTLS), true for 465
      auth: { user, pass },
      tls: { rejectUnauthorized },
      pool: true,
      maxConnections: 5,
      maxMessages: 50,
      // Optional hard timeouts
      socketTimeout: 30_000,
      connectionTimeout: 20_000,
    } as nodemailer.TransportOptions);
  }

  async onModuleInit() {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified');
    } catch (e: any) {
      this.logger.error(`SMTP verify failed: ${e?.message}`);
    }
  }

  private validateConfiguration() {
    const username = this.configService.get('GOOGLE_WORKSPACE_SMTP_USERNAME');
    const password = this.configService.get('GOOGLE_WORKSPACE_SMTP_PASSWORD');
    
    if (!username || username === 'donations@mtjfoundation.com') {
      this.logger.warn('GOOGLE_WORKSPACE_SMTP_USERNAME not configured, using default value');
    }
    
    if (!password || password === '') {
      this.logger.error('GOOGLE_WORKSPACE_SMTP_PASSWORD not configured - email sending will fail');
    }
    
    this.logger.log('Email service configuration validated');
  }

  private donationLabel(type?: string) {
    if (type === 'zakat') return 'Zakat';
    if (type === 'sadqa' || type === 'sadaqah') return 'Sadqa';
    return 'General';
  }

  async sendDonationConfirmation(d: {
    donorName: string;
    donorEmail: string;
    amount: number;
    currency: string;
    paymentUrl: string;
    donationMethod: string;
    donationType?: string;
    orderId?: string;
  }): Promise<boolean> {
    try {
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'donations@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');
      const typeLabel = this.donationLabel(d.donationType);

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress }, // must be allowed in Gmail
        to: d.donorEmail,
        subject: `${typeLabel} Donation Confirmation - ${d.orderId || 'Pending'}`,
        html: this.generateDonationConfirmationTemplate({ ...d, donationType: typeLabel }),
        text: this.generateDonationConfirmationText({ ...d, donationType: typeLabel }),
        headers: {
          'X-Mailer': 'MTJ Foundation Donation System',
          'List-Unsubscribe': `<mailto:unsubscribe@${fromAddress.split('@')[1]}>`,
          'Reply-To': fromAddress,
        },
        // envelope: { from: `bounces@${fromAddress.split('@')[1]}`, to: d.donorEmail }, // optional
        messageId: `<${Date.now()}.${Math.random().toString(36).slice(2)}@${fromAddress.split('@')[1]}>`,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Sent donation confirmation to ${d.donorEmail} (id: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Email send failed: ${error?.message} code=${error?.code} resp=${error?.response}`);
      return false;
    }
  }

  private generateDonationConfirmationTemplate(donationData: {
    donorName: string;
    donorEmail: string;
    amount: number;
    currency: string;
    paymentUrl: string;
    donationMethod: string;
    donationType?: string;
    orderId?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Donation Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .donation-details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #2c5aa0; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
        <div class="header">
          <h1>Donation Confirmation</h1>
        </div>
          
          <div class="content">
            <p>Dear ${donationData.donorName},</p>
            
            <p>We have received your donation request and appreciate your support for our cause.</p>
            
            <div class="donation-details">
              <h3>Donation Details</h3>
              <p><strong>Type:</strong> ${donationData.donationType}</p>
              <p><strong>Amount:</strong> ${donationData.currency} ${donationData.amount}</p>
              <p><strong>Payment Method:</strong> ${donationData.donationMethod.toUpperCase()}</p>
              ${donationData.orderId ? `<p><strong>Transaction ID:</strong> ${donationData.orderId}</p>` : ''}
              <p><strong>Status:</strong> Pending Payment</p>
            </div>
            
            <p>To complete your donation, please click the secure payment link below:</p>
            <a href="${donationData.paymentUrl}" class="button">Proceed to Payment</a>
            
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2c5aa0;">${donationData.paymentUrl}</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
            
            <p>Thank you again for your support!</p>
          </div>
          
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateDonationConfirmationText(donationData: {
    donorName: string;
    donorEmail: string;
    amount: number;
    currency: string;
    paymentUrl: string;
    donationMethod: string;
    donationType?: string;
    orderId?: string;
  }): string {
    return `
      Thank You for Your Donation!
      
      Dear ${donationData.donorName},
      
      Thank you for your generous donation. We truly appreciate your support for our cause.
      
      Donation Details:
      - Type: ${donationData.donationType}
      - Amount: ${donationData.currency} ${donationData.amount}
      - Payment Method: ${donationData.donationMethod.toUpperCase()}
      ${donationData.orderId ? `- Transaction ID: ${donationData.orderId}` : ''}
      - Status: Pending Payment
      
      To complete your donation, please visit: ${donationData.paymentUrl}
      
      If you have any questions or need assistance, please don't hesitate to contact us.
      
      Thank you again for your support!
      
      ---
      This is an automated message. Please do not reply to this email.
      © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
    `;
  }
}
