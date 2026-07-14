import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DataImportController } from "./data-import.controller";
import { DataImportService } from "./data-import.service";
import { DonorsImportHandler } from "./handlers/donors-import.handler";
import { DonationBoxImportHandler } from "./handlers/donation-box-import.handler";
import { DonationBoxDonationsImportHandler } from "./handlers/donation-box-donations-import.handler";
import { VolunteersImportHandler } from "./handlers/volunteers-import.handler";
import { UsersImportHandler } from "./handlers/users-import.handler";
import { DonorModule } from "../dms/donor/donor.module";
import { VolunteerModule } from "../volunteer/volunteer.module";
import { DonationBoxModule } from "../dms/donation_box/donation-box.module";
import { DonationBoxDonationModule } from "../dms/donation_box/donation_box_donation/donation_box_donation.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    DonorModule,
    DonationBoxModule,
    DonationBoxDonationModule,
    VolunteerModule,
    UsersModule,
    PermissionsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
  ],
  controllers: [DataImportController],
  providers: [
    DataImportService,
    DonorsImportHandler,
    DonationBoxImportHandler,
    DonationBoxDonationsImportHandler,
    VolunteersImportHandler,
    UsersImportHandler,
  ],
  exports: [DataImportService],
})
export class DataImportModule {}
