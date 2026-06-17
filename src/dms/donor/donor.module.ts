import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { DonorService } from "./donor.service";
import { DonorController } from "./donor.controller";
import { Donor } from "./entities/donor.entity";
import { PermissionsModule } from "../../permissions/permissions.module";
import { User } from "src/users/user.entity";
import { UsersModule } from "src/users/users.module";
import { DashboardModule } from "../../dashboard/dashboard.module";
import { DonorPasswordBackfillService } from "./donor-password-backfill.service";
import { DonorPasswordBackfillRunner } from "./donor-password-backfill.runner";
import { DonorGeoBackfillService } from "./donor-geo-backfill.service";
import { DonorGeoBackfillRunner } from "./donor-geo-backfill.runner";
import { DonorAuditModule } from "./audit/donor-audit.module";

@Module({
  imports: [
    DonorAuditModule,
    TypeOrmModule.forFeature([Donor, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    UsersModule,
    DashboardModule,
  ],
  controllers: [DonorController],
  providers: [
    DonorService,
    DonorPasswordBackfillService,
    DonorPasswordBackfillRunner,
    DonorGeoBackfillService,
    DonorGeoBackfillRunner,
  ],
  exports: [DonorService, TypeOrmModule], // Export TypeOrmModule for Donor repository
})
export class DonorModule {}
