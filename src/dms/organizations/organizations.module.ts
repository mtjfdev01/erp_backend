import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { CsrPocsService } from "./csr-pocs.service";
import { CsrPocsController } from "./csr-pocs.controller";
import { Organization } from "./entities/organization.entity";
import { OrganizationBranch } from "./entities/organization-branch.entity";
import { DonorOrganizationAffiliation } from "./entities/donor-organization-affiliation.entity";
import { CsrPoc } from "./entities/csr-poc.entity";
import { Donor } from "../donor/entities/donor.entity";
import { CsrDonorPipelineStageHistory } from "./pipeline/entities/csr-donor-pipeline-stage-history.entity";
import { CsrDonorAuditLog } from "./audit/entities/csr-donor-audit-log.entity";
import { CsrDonorAuditService } from "./audit/csr-donor-audit.service";
import { PermissionsModule } from "../../permissions/permissions.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationBranch,
      DonorOrganizationAffiliation,
      CsrPoc,
      Donor,
      CsrDonorPipelineStageHistory,
      CsrDonorAuditLog,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [OrganizationsController, CsrPocsController],
  providers: [OrganizationsService, CsrPocsService, CsrDonorAuditService],
  exports: [OrganizationsService, CsrPocsService, TypeOrmModule],
})
export class OrganizationsModule {}
