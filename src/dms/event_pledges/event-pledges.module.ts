import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";
import { EventPledge } from "./entities/event-pledge.entity";
import { EventPledgesService } from "./event-pledges.service";
import { EventPledgesController } from "./event-pledges.controller";
import { PublicEventPledgesController } from "./public-event-pledges.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([EventPledge]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [EventPledgesController, PublicEventPledgesController],
  providers: [EventPledgesService],
  exports: [EventPledgesService],
})
export class EventPledgesModule {}
