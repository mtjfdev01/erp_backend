import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { OperationalQuery } from "./entities/operational-query.entity";
import { OperationalQueriesService } from "./operational-queries.service";
import { OperationalQueriesController } from "./operational-queries.controller";
import { DonationBoxModule } from "../donation_box/donation-box.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import { PermissionsModule } from "../../permissions/permissions.module";
import { User } from "../../users/user.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([OperationalQuery, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    NotificationsModule,
    DonationBoxModule,
  ],
  controllers: [OperationalQueriesController],
  providers: [OperationalQueriesService],
  exports: [OperationalQueriesService],
})
export class OperationalQueriesModule {}
