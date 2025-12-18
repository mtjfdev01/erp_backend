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
    // Default to port 465 for Railway (more likely to work when 587 is blocked)
    const port = Number(this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PORT', '465'));
    // Default to secure=true for port 465, false for 587
    const defaultSecure = port === 465 ? 'true' : 'false';
    const secure = String(this.configService.get('GOOGLE_WORKSPACE_SMTP_SECURE', defaultSecure)) === 'true';
    const user = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'donations@mtjfoundation.com');
    const pass = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PASSWORD', '');
    const rejectUnauthorized = String(this.configService.get('GOOGLE_WORKSPACE_SMTP_TLS_REJECT_UNAUTHORIZED', 'true')) === 'true';

    this.logger.log(`Initializing SMTP transporter: ${host}:${port} (secure: ${secure})`);
    
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user, pass },
      tls: { 
        rejectUnauthorized,
        servername: host,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 50,
      // Increased timeouts for production network latency (Railway)
      socketTimeout: 120_000, // 120 seconds - increased for Railway
      connectionTimeout: 60_000, // 60 seconds - increased for Railway
      greetingTimeout: 30_000, // 30 seconds - increased for Railway
      debug: process.env.NODE_ENV === 'development', // Enable debug in dev
      logger: process.env.NODE_ENV === 'development', // Enable logger in dev
    } as nodemailer.TransportOptions);
  }

  async onModuleInit() {
    // Skip SMTP verification in production if it causes startup issues
    // Verification will happen on first email send attempt
    const skipVerification = this.configService.get<string>('SKIP_SMTP_VERIFICATION',  'false') === 'true';
    
    if (skipVerification) {
      this.logger.warn('SMTP verification skipped (SKIP_SMTP_VERIFICATION=true)');
      this.logger.warn('Connection will be tested on first email send');
      return;
    }

    try {
      // Increased timeout for Railway/production networks (30 seconds)
      const verifyPromise = this.transporter.verify();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SMTP verification timeout after 30 seconds')), 30000)
      );

      await Promise.race([verifyPromise, timeoutPromise]);
      this.logger.log('SMTP connection verified successfully');
    } catch (e: any) {
      this.logger.error(`SMTP verify failed: ${e?.message}`);
      this.logger.error(`Error code: ${e?.code || 'N/A'}, Error response: ${e?.response || 'N/A'}`);
      this.logger.warn('Email service will attempt connection on first send');
      this.logger.warn('To skip verification on startup, set SKIP_SMTP_VERIFICATION=true');
      // Don't throw - allow app to start, verification will retry on actual send
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
      this.logger.error(`Email send failed: ${error?.message}`);
      this.logger.error(`Error code: ${error?.code || 'N/A'}, Response: ${error?.response || 'N/A'}`);
      this.logger.error(`Command: ${error?.command || 'N/A'}`);
      if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
        this.logger.error('Connection issue - check port, firewall, or network');
      }
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

  // Send donation success notification to admin
  async sendDonationSuccessNotification(donation: any, paymentDetails: any): Promise<boolean> {
    try {
      const staticEmailAddress = 'dev@mtjfoundation.org';
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'donations@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress },
        to: staticEmailAddress,
        subject: `✅ Donation Success - ${donation.donor_name || 'Anonymous'} - ${donation.amount} ${donation.currency || 'PKR'}`,
        html: this.generateDonationSuccessTemplate(donation, paymentDetails),
        text: this.generateDonationSuccessText(donation, paymentDetails),
        headers: {
          'X-Mailer': 'MTJ Foundation Donation System',
          'Reply-To': fromAddress,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Sent donation success notification to ${staticEmailAddress} (id: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Donation success email send failed: ${error?.message}`);
      return false;
    }
  }

  // Send donation failure notification to admin
  async sendDonationFailureNotification(donation: any, errorDetails: any): Promise<boolean> {
    try {
      const staticEmailAddress = process.env.NOTIFICATION_EMAIL || 'irfan.waheed@mtjfoundation.org';
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'donations@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress },
        to: staticEmailAddress,
        subject: `❌ Donation Failed - ${donation.donor_name || 'Anonymous'} - ${donation.amount} ${donation.currency || 'PKR'}`,
        html: this.generateDonationFailureTemplate(donation, errorDetails),
        text: this.generateDonationFailureText(donation, errorDetails),
        headers: {
          'X-Mailer': 'MTJ Foundation Donation System',
          'Reply-To': fromAddress,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Sent donation failure notification to ${staticEmailAddress} (id: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Donation failure email send failed: ${error?.message}`);
      return false;
    }
  }

  private generateDonationSuccessTemplate(donation: any, paymentDetails: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Donation Success Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .donation-details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #28a745; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Donation Successfully Processed</h1>
          </div>
          
          <div class="content">
            <div class="donation-details">
              <h3>Donation Details</h3>
              <p><strong>Donation ID:</strong> ${donation.id}</p>
              <p><strong>Donor Name:</strong> ${donation.donor_name || 'Anonymous'}</p>
              <p><strong>Donor Email:</strong> ${donation.donor_email || 'N/A'}</p>
              <p><strong>Amount:</strong> ${donation.amount} ${donation.currency || 'PKR'}</p>
              <p><strong>Transaction ID:</strong> ${paymentDetails.transaction_id}</p>
              <p><strong>Payment Date:</strong> ${paymentDetails.order_date}</p>
              <p><strong>Payment Method:</strong> ${paymentDetails.PaymentName || 'PayFast'}</p>
              <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Completed</span></p>
            </div>
            
            <p><em>This is an automated notification from your donation system.</em></p>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateDonationSuccessText(donation: any, paymentDetails: any): string {
    return `
      🎉 Donation Successfully Processed
      
      Donation Details:
      - Donation ID: ${donation.id}
      - Donor Name: ${donation.donor_name || 'Anonymous'}
      - Donor Email: ${donation.donor_email || 'N/A'}
      - Amount: ${donation.amount} ${donation.currency || 'PKR'}
      - Transaction ID: ${paymentDetails.transaction_id}
      - Payment Date: ${paymentDetails.order_date}
      - Payment Method: ${paymentDetails.PaymentName || 'PayFast'}
      - Status: Completed
      
      This is an automated notification from your donation system.
      
      © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
    `;
  }

  private generateDonationFailureTemplate(donation: any, errorDetails: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Donation Failure Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .donation-details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #dc3545; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Donation Processing Failed</h1>
          </div>
          
          <div class="content">
            <div class="donation-details">
              <h3>Donation Details</h3>
              <p><strong>Donation ID:</strong> ${donation.id}</p>
              <p><strong>Donor Name:</strong> ${donation.donor_name || 'Anonymous'}</p>
              <p><strong>Donor Email:</strong> ${donation.donor_email || 'N/A'}</p>
              <p><strong>Amount:</strong> ${donation.amount} ${donation.currency || 'PKR'}</p>
              <p><strong>Error Code:</strong> ${errorDetails.err_code}</p>
              <p><strong>Error Message:</strong> ${errorDetails.err_msg || 'Unknown error'}</p>
              <p><strong>Transaction ID:</strong> ${errorDetails.transaction_id || 'N/A'}</p>
              <p><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">Failed</span></p>
            </div>
            
            <p><em>This is an automated notification from your donation system.</em></p>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateDonationFailureText(donation: any, errorDetails: any): string {
    return `
      ⚠️ Donation Processing Failed
      
      Donation Details:
      - Donation ID: ${donation.id}
      - Donor Name: ${donation.donor_name || 'Anonymous'}
      - Donor Email: ${donation.donor_email || 'N/A'}
      - Amount: ${donation.amount} ${donation.currency || 'PKR'}
      - Error Code: ${errorDetails.err_code}
      - Error Message: ${errorDetails.err_msg || 'Unknown error'}
      - Transaction ID: ${errorDetails.transaction_id || 'N/A'}
      - Status: Failed
      
      This is an automated notification from your donation system.
      
      © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
    `;
  }

  // ============================================
  // JOB APPLICATION EMAIL METHODS
  // ============================================

  /**
   * Send job application confirmation email to applicant
   */
  async sendJobApplicationConfirmation(data: {
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    applicationId: number;
  }): Promise<boolean> {
    try {
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'careers@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress },
        to: data.applicantEmail,
        subject: `Application Received - ${data.jobTitle}`,
        html: this.generateJobApplicationConfirmationTemplate(data),
        text: this.generateJobApplicationConfirmationText(data),
        headers: {
          'X-Mailer': 'MTJ Foundation Career Portal',
          'Reply-To': fromAddress,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Sent job application confirmation to ${data.applicantEmail} (id: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Job application confirmation email send failed: ${error?.message}`);
      return false;
    }
  }

  /**
   * Send new job application notification to admin
   */
  async sendNewJobApplicationNotification(data: {
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    applicationId: number;
  }): Promise<boolean> {
    try {
      const staticEmailAddress = 'dev@mtjfoundation.org';
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'careers@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress },
        to: staticEmailAddress,
        subject: `New Job Application - ${data.jobTitle}`,
        html: this.generateNewJobApplicationNotificationTemplate(data),
        text: this.generateNewJobApplicationNotificationText(data),
        headers: {
          'X-Mailer': 'MTJ Foundation Career Portal',
          'Reply-To': fromAddress,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Sent new job application notification to ${staticEmailAddress} (id: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`New job application notification email send failed: ${error?.message}`);
      return false;
    }
  }

  /**
   * Send job application status update email to applicant
   */
  async sendJobApplicationStatusUpdate(data: {
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    oldStatus: string;
    newStatus: string;
  }): Promise<boolean> {
    try {
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'careers@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress },
        to: data.applicantEmail,
        subject: `Application Update - ${data.jobTitle}`,
        html: this.generateJobApplicationStatusUpdateTemplate(data),
        text: this.generateJobApplicationStatusUpdateText(data),
        headers: {
          'X-Mailer': 'MTJ Foundation Career Portal',
          'Reply-To': fromAddress,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Sent job application status update to ${data.applicantEmail} (id: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Job application status update email send failed: ${error?.message}`);
      return false;
    }
  }

  private generateJobApplicationConfirmationTemplate(data: {
    applicantName: string;
    jobTitle: string;
    applicationId: number;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Application Received</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div class="container" style="background-color: #f9f9f9; padding: 30px; border-radius: 10px;">
          <div class="header" style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50;">Application Received</h1>
          </div>
          
          <div class="content" style="background-color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
            <p>Dear ${data.applicantName},</p>
            
            <p>Thank you for your interest in joining the MTJ Foundation team!</p>
            
            <p>We have successfully received your application for the position of <strong>${data.jobTitle}</strong>.</p>
            
            <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Application ID:</strong> ${data.applicationId}</p>
              <p style="margin: 5px 0 0 0;"><strong>Status:</strong> Pending Review</p>
            </div>
            
            <p>Our HR team will review your application and get back to you soon. We appreciate your patience during this process.</p>
            
            <p>If you have any questions, please feel free to contact us.</p>
            
            <p>Best regards,<br>MTJ Foundation HR Team</p>
          </div>
          
          <div class="footer" style="text-align: center; color: #666; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateJobApplicationConfirmationText(data: {
    applicantName: string;
    jobTitle: string;
    applicationId: number;
  }): string {
    return `
      Application Received

      Dear ${data.applicantName},

      Thank you for your interest in joining the MTJ Foundation team!

      We have successfully received your application for the position of ${data.jobTitle}.

      Application ID: ${data.applicationId}
      Status: Pending Review

      Our HR team will review your application and get back to you soon. We appreciate your patience during this process.

      If you have any questions, please feel free to contact us.

      Best regards,
      MTJ Foundation HR Team

      © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
    `;
  }

  private generateNewJobApplicationNotificationTemplate(data: {
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    applicationId: number;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Job Application</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div class="container" style="background-color: #f9f9f9; padding: 30px; border-radius: 10px;">
          <div class="header" style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50;">New Job Application</h1>
          </div>
          
          <div class="content" style="background-color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
            <p>A new job application has been submitted:</p>
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Application ID:</strong> ${data.applicationId}</p>
              <p style="margin: 5px 0 0 0;"><strong>Applicant Name:</strong> ${data.applicantName}</p>
              <p style="margin: 5px 0 0 0;"><strong>Applicant Email:</strong> ${data.applicantEmail}</p>
              <p style="margin: 5px 0 0 0;"><strong>Job Title:</strong> ${data.jobTitle}</p>
              <p style="margin: 5px 0 0 0;"><strong>Status:</strong> Pending Review</p>
            </div>
            
            <p>Please review the application in the admin panel.</p>
          </div>
          
          <div class="footer" style="text-align: center; color: #666; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateNewJobApplicationNotificationText(data: {
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    applicationId: number;
  }): string {
    return `
      New Job Application

      A new job application has been submitted:

      Application ID: ${data.applicationId}
      Applicant Name: ${data.applicantName}
      Applicant Email: ${data.applicantEmail}
      Job Title: ${data.jobTitle}
      Status: Pending Review

      Please review the application in the admin panel.

      © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
    `;
  }

  private generateJobApplicationStatusUpdateTemplate(data: {
    applicantName: string;
    jobTitle: string;
    oldStatus: string;
    newStatus: string;
  }): string {
    const statusMessages: { [key: string]: string } = {
      reviewed: 'Your application has been reviewed by our team.',
      shortlisted: 'Congratulations! You have been shortlisted for this position.',
      rejected: 'Thank you for your interest. Unfortunately, we are unable to proceed with your application at this time.',
      hired: 'Congratulations! We are pleased to offer you this position.',
    };

    const message = statusMessages[data.newStatus] || 'Your application status has been updated.';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Application Update</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div class="container" style="background-color: #f9f9f9; padding: 30px; border-radius: 10px;">
          <div class="header" style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50;">Application Update</h1>
          </div>
          
          <div class="content" style="background-color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
            <p>Dear ${data.applicantName},</p>
            
            <p>We are writing to update you on the status of your application for the position of <strong>${data.jobTitle}</strong>.</p>
            
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Previous Status:</strong> ${data.oldStatus}</p>
              <p style="margin: 5px 0 0 0;"><strong>New Status:</strong> ${data.newStatus}</p>
            </div>
            
            <p>${message}</p>
            
            <p>If you have any questions, please feel free to contact us.</p>
            
            <p>Best regards,<br>MTJ Foundation HR Team</p>
          </div>
          
          <div class="footer" style="text-align: center; color: #666; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateJobApplicationStatusUpdateText(data: {
    applicantName: string;
    jobTitle: string;
    oldStatus: string;
    newStatus: string;
  }): string {
    const statusMessages: { [key: string]: string } = {
      reviewed: 'Your application has been reviewed by our team.',
      shortlisted: 'Congratulations! You have been shortlisted for this position.',
      rejected: 'Thank you for your interest. Unfortunately, we are unable to proceed with your application at this time.',
      hired: 'Congratulations! We are pleased to offer you this position.',
    };

    const message = statusMessages[data.newStatus] || 'Your application status has been updated.';

    return `
      Application Update

      Dear ${data.applicantName},

      We are writing to update you on the status of your application for the position of ${data.jobTitle}.

      Previous Status: ${data.oldStatus}
      New Status: ${data.newStatus}

      ${message}

      If you have any questions, please feel free to contact us.

      Best regards,
      MTJ Foundation HR Team

      © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
    `;
  }

  /**
   * Test SMTP connection - for debugging
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      await this.transporter.verify();
      return {
        success: true,
        message: 'SMTP connection successful',
        details: {
          host: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_HOST'),
          port: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PORT'),
          secure: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_SECURE'),
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `SMTP connection failed: ${error?.message}`,
        details: {
          code: error?.code,
          command: error?.command,
          response: error?.response,
          host: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_HOST'),
          port: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PORT'),
        }
      };
    }
  }

  /**
   * Send test email - for debugging SMTP configuration
   */
  async sendTestEmail(to: string = 'dev@mtjfoundation.org'): Promise<{ success: boolean; message: string; details?: any; error?: any; troubleshooting?: any; timestamp?: string }> {
    try {
      const fromAddress = this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_USERNAME', 'donations@mtjfoundation.com');
      const senderName = this.configService.get<string>('SENDER_NAME', 'MTJ Foundation');

      const mailOptions: nodemailer.SendMailOptions = {
        from: { name: senderName, address: fromAddress },
        to: to,
        subject: 'Test Email - Hello from MTJ ERP',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Email</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Hello from MTJ ERP!</h1>
              </div>
              <div class="content">
                <p>This is a test email from your MTJ ERP backend.</p>
                <p>If you received this email, your SMTP configuration is working correctly!</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p><strong>Server:</strong> Railway Production</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} MTJ Foundation. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Hello from MTJ ERP!
          
          This is a test email from your MTJ ERP backend.
          
          If you received this email, your SMTP configuration is working correctly!
          
          Timestamp: ${new Date().toISOString()}
          Server: Railway Production
          
          © ${new Date().getFullYear()} MTJ Foundation. All rights reserved.
        `,
        headers: {
          'X-Mailer': 'MTJ Foundation ERP Test',
          'Reply-To': fromAddress,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Test email sent to ${to} (id: ${result.messageId})`);
      
      return {
        success: true,
        message: 'Test email sent successfully',
        details: {
          to: to,
          messageId: result.messageId,
          response: result.response,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      this.logger.error(`Test email send failed: ${error?.message}`);
      this.logger.error(`Error code: ${error?.code || 'N/A'}, Command: ${error?.command || 'N/A'}, Response: ${error?.response || 'N/A'}`);
      
      // Provide helpful error messages based on error type
      let helpfulMessage = 'Failed to send test email';
      if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNREFUSED') {
        helpfulMessage = 'Connection timeout or refused. Railway may be blocking SMTP ports. Try port 465 or contact Railway support.';
      } else if (error?.code === 'EAUTH') {
        helpfulMessage = 'Authentication failed. Check your App Password.';
      } else if (error?.code === 'EENVELOPE') {
        helpfulMessage = 'Email address error. Check recipient address.';
      }
      
      return {
        success: false,
        message: helpfulMessage,
        error: {
          message: error?.message,
          code: error?.code,
          command: error?.command,
          response: error?.response
        },
        troubleshooting: {
          port: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_PORT', '465'),
          host: this.configService.get<string>('GOOGLE_WORKSPACE_SMTP_HOST', 'smtp.gmail.com'),
          suggestion: error?.code === 'ETIMEDOUT' ? 'Railway may block SMTP. Try: 1) Use port 465, 2) Contact Railway support about SMTP access, 3) Use email service like SendGrid/Resend' : 'Check SMTP credentials and network connectivity'
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}
