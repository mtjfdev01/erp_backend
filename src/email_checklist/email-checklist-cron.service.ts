import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { EmailChecklistService } from "./email-checklist.service";

@Injectable()
export class EmailChecklistCronService {
  private readonly logger = new Logger(EmailChecklistCronService.name);

  constructor(private readonly emailChecklistService: EmailChecklistService) {}

  @Cron("*/15 * * * *", {
    name: "email-checklist-sync",
    timeZone: "Asia/Karachi",
  })
  async syncInboxes() {
    try {
      const count = await this.emailChecklistService.syncAllConnectedUsers();
      if (count > 0) {
        this.logger.log(`Email checklist: imported ${count} new item(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Email checklist cron failed: ${error?.message}`);
    }
  }
}
