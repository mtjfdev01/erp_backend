import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiKeysModule } from "../../api-keys/api-keys.module";
import { PermissionsModule } from "../../permissions/permissions.module";
import { UsersModule } from "../../users/users.module";
import { S3StorageModule } from "../../utils/storage/s3-storage.module";
import { AidApplicationsController } from "./aid-applications.controller";
import { AidApplicationsService } from "./aid-applications.service";
import { AidDisbursementsController } from "./aid-disbursements.controller";
import { AidDisbursementsService } from "./aid-disbursements.service";
import { AidOverviewController } from "./aid-overview.controller";
import { AidOverviewService } from "./aid-overview.service";
import { AidHouseholdsController } from "./aid-households.controller";
import { AidHouseholdsService } from "./aid-households.service";
import { AidPeopleController } from "./aid-people.controller";
import { AidPeopleService } from "./aid-people.service";
import { AidApplication } from "./entities/aid-application.entity";
import { AidAttachment } from "./entities/aid-attachment.entity";
import { AidDisbursement } from "./entities/aid-disbursement.entity";
import { AidHouseholdMember } from "./entities/aid-household-member.entity";
import { AidHousehold } from "./entities/aid-household.entity";
import { AidKinshipEdge } from "./entities/aid-kinship-edge.entity";
import { AidPerson } from "./entities/aid-person.entity";
import { AidAuditController } from "./audit/aid-audit.controller";
import { AidAuditService } from "./audit/aid-audit.service";
import { AidApplicationAuditLog } from "./audit/entities/aid-application-audit-log.entity";
import { AskClinicBeneficiariesController } from "./integrations/ask-clinic-beneficiaries.controller";
import { AskClinicBeneficiariesService } from "./integrations/ask-clinic-beneficiaries.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AidPerson,
      AidHousehold,
      AidHouseholdMember,
      AidKinshipEdge,
      AidApplication,
      AidAttachment,
      AidDisbursement,
      AidApplicationAuditLog,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    UsersModule,
    S3StorageModule,
    ApiKeysModule,
  ],
  controllers: [
    AidPeopleController,
    AidHouseholdsController,
    AidOverviewController,
    AidApplicationsController,
    AidDisbursementsController,
    AidAuditController,
    AskClinicBeneficiariesController,
  ],
  providers: [
    AidPeopleService,
    AidHouseholdsService,
    AidApplicationsService,
    AidOverviewService,
    AidDisbursementsService,
    AidAuditService,
    AskClinicBeneficiariesService,
  ],
  exports: [
    AidPeopleService,
    AidHouseholdsService,
    AidApplicationsService,
    AidOverviewService,
    AidDisbursementsService,
    AidAuditService,
    AskClinicBeneficiariesService,
    TypeOrmModule,
  ],
})
export class AidModule {}
