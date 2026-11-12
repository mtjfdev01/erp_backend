import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";
import { Donation } from "../../donations/entities/donation.entity";
import { DonationAttachment } from "../../donations/entities/donation-attachment.entity";
import { DonationBoxDonation } from "../donation_box/donation_box_donation/entities/donation_box_donation.entity";
import { RecurringDonation } from "../../donations/recurring_donations/entities/recurring-donation.entity";
import { RecurringDonationAttachment } from "../../donations/recurring_donations/entities/recurring-donation-attachment.entity";
import { Donor } from "../donor/entities/donor.entity";
import { DonationsModule } from "../../donations/donations.module";
import { DonationBoxDonationModule } from "../donation_box/donation_box_donation/donation_box_donation.module";
import { RecurringDonationsStripeModule } from "../../donations/recurring_donations/recurring-donations-stripe.module";
import { ReconciliationWorkbenchController } from "./reconciliation-workbench.controller";
import { ReconciliationWorkbenchService } from "./reconciliation-workbench.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Donation,
      DonationAttachment,
      DonationBoxDonation,
      RecurringDonation,
      RecurringDonationAttachment,
      Donor,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    DonationsModule,
    DonationBoxDonationModule,
    RecurringDonationsStripeModule,
  ],
  controllers: [ReconciliationWorkbenchController],
  providers: [ReconciliationWorkbenchService],
  exports: [ReconciliationWorkbenchService],
})
export class ReconciliationWorkbenchModule {}
