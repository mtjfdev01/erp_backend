import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import {
  generateExtensionRequestEmailTemplate,
  generateExtensionDecisionEmailTemplate,
} from "./taskExtensionTemplate";

@Injectable()
export class TaskExtensionNotificationService {
  private readonly logger = new Logger(TaskExtensionNotificationService.name);
  private resend: Resend | null = null;

  constructor(private readonly configService: ConfigService) {
    const resendApiKey = this.configService.get<string>("RESEND_API_KEY");
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    } else {
      this.logger.warn("RESEND_API_KEY is not configured for TaskExtensionNotificationService");
    }
  }

  async sendTaskExtensionRequestEmail(
    recipient: any,
    task: any,
    extension: any,
    requester?: any,
  ): Promise<boolean> {
    try {
      const fromEmail = this.configService.get<string>(
        "RESEND_FROM_EMAIL",
        "info@mtjfoundation.com",
      );
      const senderName = this.configService.get<string>(
        "SENDER_NAME",
        "MTJ Foundation",
      );

      if (!this.resend) {
        this.logger.error("Resend is not configured - cannot send email");
        return false;
      }

      if (!recipient?.email) {
        this.logger.warn("Recipient email is missing for extension request");
        return false;
      }

      const result = await this.resend.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to: [recipient.email],
        subject: `Deadline Extension Request: ${task?.title || "Task"}`,
        html: generateExtensionRequestEmailTemplate(
          task,
          extension,
          requester,
          recipient,
        ),
      });

      const success = !!result.data?.id;
      if (success) {
        this.logger.log(
          `Sent task extension request notification to ${recipient.email} (id: ${result.data?.id})`,
        );
      } else if (result.error) {
        this.logger.warn(`Resend error: ${JSON.stringify(result.error)}`);
      }
      return success;
    } catch (error: any) {
      this.logger.error(
        `Task extension request email failed: ${error?.message}`,
      );
      return false;
    }
  }

  async sendTaskExtensionDecisionEmail(
    recipient: any,
    task: any,
    extension: any,
    decision: "approved" | "rejected",
    reviewer?: any,
  ): Promise<boolean> {
    try {
      const fromEmail = this.configService.get<string>(
        "RESEND_FROM_EMAIL",
        "info@mtjfoundation.com",
      );
      const senderName = this.configService.get<string>(
        "SENDER_NAME",
        "MTJ Foundation",
      );

      if (!this.resend) {
        this.logger.error("Resend is not configured - cannot send email");
        return false;
      }

      if (!recipient?.email) {
        this.logger.warn("Recipient email is missing for extension decision");
        return false;
      }

      const subject = `Deadline Extension Request ${decision === "approved" ? "Approved" : "Rejected"}: ${task?.title || "Task"}`;

      const result = await this.resend.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to: [recipient.email],
        subject,
        html: generateExtensionDecisionEmailTemplate(
          task,
          extension,
          decision,
          reviewer,
        ),
      });

      const success = !!result.data?.id;
      if (success) {
        this.logger.log(
          `Sent task extension decision notification to ${recipient.email} (id: ${result.data?.id})`,
        );
      } else if (result.error) {
        this.logger.warn(`Resend error: ${JSON.stringify(result.error)}`);
      }
      return success;
    } catch (error: any) {
      this.logger.error(
        `Task extension decision email failed: ${error?.message}`,
      );
      return false;
    }
  }
}
