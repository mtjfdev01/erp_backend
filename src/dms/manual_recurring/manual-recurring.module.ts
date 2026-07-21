import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ManualRecurringPledge } from "./entities/manual-recurring-pledge.entity";
import { ManualRecurringPledgeLine } from "./entities/manual-recurring-pledge-line.entity";
import { CampaignDonationItem } from "../campaigns/entities/campaign-donation-item.entity";
import { ManualRecurringService } from "./manual-recurring.service";
import { ManualRecurringReminderService } from "./manual-recurring-reminder.service";
import { ManualRecurringController } from "./manual-recurring.controller";
import { Donor } from "../donor/entities/donor.entity";
import { Donation } from "../../donations/entities/donation.entity";
import { RecurringDonation } from "../../donations/recurring_donations/entities/recurring-donation.entity";
import { Campaign } from "../campaigns/entities/campaign.entity";
import { EmailTemplateModule } from "../email_template/email_template.module";

@Module({
  imports: [
    ConfigModule,
    EmailTemplateModule,
    TypeOrmModule.forFeature([
      ManualRecurringPledge,
      ManualRecurringPledgeLine,
      CampaignDonationItem,
      Donor,
      Donation,
      RecurringDonation,
      Campaign,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
  ],
  controllers: [ManualRecurringController],
  providers: [ManualRecurringService, ManualRecurringReminderService],
  exports: [ManualRecurringService, ManualRecurringReminderService],
})
export class ManualRecurringModule {}
