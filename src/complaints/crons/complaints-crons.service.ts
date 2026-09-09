import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ComplaintsService } from "../complaints.service";

@Injectable()
export class ComplaintsCronsService {
  private readonly logger = new Logger(ComplaintsCronsService.name);

  constructor(private readonly complaintsService: ComplaintsService) {}

  @Cron(CronExpression.EVERY_HOUR, { timeZone: "Asia/Karachi" })
  async handleDueReminders() {
    try {
      const count = await this.complaintsService.processDueReminders();
      if (count > 0) {
        this.logger.log(`Processed ${count} complaint due reminder(s)`);
      }
    } catch (error) {
      this.logger.error(`Complaint due reminders failed: ${error?.message}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: "Asia/Karachi" })
  async handleRecurringComplaintCutoff() {
    try {
      const count = await this.complaintsService.finalizeRecurringCutoffs();
      if (count > 0) {
        this.logger.log(`Finalized ${count} recurring complaint cutoff(s)`);
      }
    } catch (error) {
      this.logger.error(`Recurring task cutoff failed: ${error?.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: "Asia/Karachi" })
  async handleOverdueEscalation() {
    try {
      const count = await this.complaintsService.overdueEscalation();
      this.logger.log(`Overdue escalation processed for ${count} complaints`);
    } catch (error) {
      this.logger.error(`Overdue escalation failed: ${error?.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { timeZone: "Asia/Karachi" })
  async handleRecurrence() {
    try {
      const count = await this.complaintsService.processRecurrence();
      if (count > 0) {
        this.logger.log(`Recurrence processed: ${count} new complaints created`);
      }
    } catch (error) {
      this.logger.error(`Recurrence processing failed: ${error?.message}`);
    }
  }
}
