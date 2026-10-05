import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";
import { RecurringReminderLog } from "./entities/recurring-reminder-log.entity";
import { RecurringReminderLogsService } from "./recurring-reminder-logs.service";
import { RecurringReminderLogsController } from "./recurring-reminder-logs.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringReminderLog]),
    PermissionsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
  ],
  controllers: [RecurringReminderLogsController],
  providers: [RecurringReminderLogsService],
  exports: [RecurringReminderLogsService],
})
export class RecurringReminderLogsModule {}
