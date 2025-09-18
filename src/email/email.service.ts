import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('AWS_SES_SMTP_HOST', 'email-smtp.eu-north-1.amazonaws.com'),
      port: this.configService.get('AWS_SES_SMTP_PORT', 587),
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get('AWS_SES_SMTP_USERNAME'), // Your AWS SES SMTP username
        pass: this.configService.get('AWS_SES_SMTP_PASSWORD'), // Your AWS SES SMTP password
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
      },
    });
  }

  async sendDonationConfirmation(donationData: {
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
      // Get verified sender email from environment
      const verifiedSenderEmail = this.configService.get('VERIFIED_SENDER_EMAIL');
      const senderName = this.configService.get('SENDER_NAME', 'Donation System');
      
      // Debug logging
      this.logger.log(`VERIFIED_SENDER_EMAIL from config: ${verifiedSenderEmail}`);
      this.logger.log(`SENDER_NAME from config: ${senderName}`);
      
      if (!verifiedSenderEmail) {
        this.logger.error('VERIFIED_SENDER_EMAIL not configured');
        return false;
      }

      const mailOptions = {
        from: {
          name: senderName,
          address: verifiedSenderEmail
        },
        to: donationData.donorEmail,
        subject: `${donationData.donationType === 'zakat' ? 'Zakat' : 'Sadqa'} Donation Confirmation - ${donationData.orderId || 'Pending'}`,
        html: this.generateDonationConfirmationTemplate(donationData),
        text: this.generateDonationConfirmationText(donationData),
        headers: {
          'X-Mailer': 'MTJ Foundation Donation System',
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
          'Importance': 'Normal',
          'X-Report-Abuse': 'Please report abuse to abuse@mtjfoundation.com',
          'List-Unsubscribe': '<mailto:unsubscribe@mtjfoundation.com>',
          'Return-Path': verifiedSenderEmail,
          'Reply-To': verifiedSenderEmail,
        },
        // Add message ID for better tracking
        messageId: `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@mtjfoundation.com>`,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Donation confirmation email sent to ${donationData.donorEmail}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send donation confirmation email: ${error.message}`);
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
              <p><strong>Type:</strong> ${donationData.donationType === 'zakat' ? 'Zakat' : 'Sadqa'}</p>
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
            <p>&copy; ${new Date().getFullYear()} Your Organization Name. All rights reserved.</p>
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
      - Type: ${donationData.donationType === 'zakat' ? 'Zakat' : 'Sadqa'}
      - Amount: ${donationData.currency} ${donationData.amount}
      - Payment Method: ${donationData.donationMethod.toUpperCase()}
      ${donationData.orderId ? `- Transaction ID: ${donationData.orderId}` : ''}
      - Status: Pending Payment
      
      To complete your donation, please visit: ${donationData.paymentUrl}
      
      If you have any questions or need assistance, please don't hesitate to contact us.
      
      Thank you again for your support!
      
      ---
      This is an automated message. Please do not reply to this email.
      © ${new Date().getFullYear()} Your Organization Name. All rights reserved.
    `;
  }

  async sendTestEmail(to: string): Promise<boolean> {
    try {
      const verifiedSenderEmail = this.configService.get('VERIFIED_SENDER_EMAIL');
      const senderName = this.configService.get('SENDER_NAME', 'Donation System');
      
      if (!verifiedSenderEmail) {
        this.logger.error('VERIFIED_SENDER_EMAIL not configured');
        return false;
      }

      const mailOptions = {
        from: {
          name: senderName,
          address: verifiedSenderEmail
        },
        to,
        subject: 'Test Email from Donation System',
        html: '<h1>Test Email</h1><p>This is a test email from the donation system.</p>',
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Test email sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send test email: ${error.message}`);
      return false;
    }
  }
}
