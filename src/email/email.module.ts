import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EmailService } from "./email.service";
import { DonationReceiptsService } from "./donationReceipts.service";
import { TaskExtensionNotificationService } from "./taskExtensionNotification.service";

@Module({
  imports: [ConfigModule],
  providers: [
    EmailService,
    DonationReceiptsService,
    TaskExtensionNotificationService,
  ],
  exports: [
    EmailService,
    DonationReceiptsService,
    TaskExtensionNotificationService,
  ],
})
export class EmailModule {}
