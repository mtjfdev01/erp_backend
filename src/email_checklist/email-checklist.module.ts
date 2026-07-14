import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { PermissionsModule } from "../permissions";
import { GmailConnection } from "./entities/gmail-connection.entity";
import { EmailChecklistItem } from "./entities/email-checklist-item.entity";
import { GmailOAuthAppConfig } from "./entities/gmail-oauth-app-config.entity";
import { EmailChecklistService } from "./email-checklist.service";
import { EmailChecklistController } from "./email-checklist.controller";
import { EmailChecklistCronService } from "./email-checklist-cron.service";
import { GmailService } from "./gmail.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GmailConnection,
      EmailChecklistItem,
      GmailOAuthAppConfig,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    ScheduleModule,
  ],
  controllers: [EmailChecklistController],
  providers: [EmailChecklistService, EmailChecklistCronService, GmailService],
  exports: [EmailChecklistService],
})
export class EmailChecklistModule {}
