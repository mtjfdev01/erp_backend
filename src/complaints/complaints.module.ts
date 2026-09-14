import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ComplaintsService } from "./complaints.service";
import { ComplaintCaseService } from "./complaint-case.service";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintCaseController } from "./complaint-case.controller";
import { ComplaintCasePublicController } from "./complaint-case-public.controller";
import { Complaint } from "./entities/complaint.entity";
import { ComplaintNotification } from "./entities/complaint-notification.entity";
import { ComplaintAttachment } from "./entities/complaint-attachment.entity";
import { ComplaintComment } from "./entities/complaint-comment.entity";
import { ComplaintActivity } from "./entities/complaint-activity.entity";
import { ComplaintTimeEntry } from "./entities/complaint-time-entry.entity";
import { ComplaintApproval } from "./entities/complaint-approval.entity";
import { ComplaintDueReminder } from "./entities/complaint-due-reminder.entity";
import { ComplaintMeeting } from "./entities/complaint-meeting.entity";
import { ComplaintInvestigationLog } from "./entities/complaint-investigation-log.entity";
import { User } from "../users/user.entity";
import { PermissionsModule } from "../permissions";
import { JwtModule } from "@nestjs/jwt";
import { EmailModule } from "../email/email.module";
import { ScheduleModule } from "@nestjs/schedule";
import { ComplaintsCronsService } from "./crons/complaints-crons.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Complaint,
      ComplaintNotification,
      ComplaintAttachment,
      ComplaintComment,
      ComplaintActivity,
      ComplaintTimeEntry,
      ComplaintApproval,
      ComplaintDueReminder,
      ComplaintMeeting,
      ComplaintInvestigationLog,
      User,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    EmailModule,
    ScheduleModule,
    NotificationsModule,
  ],
  controllers: [
    ComplaintsController,
    ComplaintCaseController,
    ComplaintCasePublicController,
  ],
  providers: [ComplaintsService, ComplaintCaseService, ComplaintsCronsService],
  exports: [ComplaintsService, ComplaintCaseService],
})
export class ComplaintsModule {}
