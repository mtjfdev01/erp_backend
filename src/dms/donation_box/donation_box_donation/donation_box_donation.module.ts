import { Module } from "@nestjs/common";
import { DonationBoxDonationService } from "./donation_box_donation.service";
import { DonationBoxDonationController } from "./donation_box_donation.controller";
import { DonationBoxModule } from "../donation-box.module";
import { DonationBoxDonation } from "./entities/donation_box_donation.entity";
import { DonationBox } from "../entities/donation-box.entity";
import { User } from "../../../users/user.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";
import { DashboardModule } from "../../../dashboard/dashboard.module";
import { DonationBoxDonationAuditModule } from "./audit/donation-box-donation-audit.module";
import { City } from "../../geographic/cities/entities/city.entity";

@Module({
  imports: [
    DonationBoxDonationAuditModule,
    TypeOrmModule.forFeature([DonationBox, DonationBoxDonation, User, City]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    DashboardModule,
  ],
  controllers: [DonationBoxDonationController],
  providers: [DonationBoxDonationService],
  exports: [DonationBoxDonationService],
})
export class DonationBoxDonationModule {}
