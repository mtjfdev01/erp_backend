import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ApplicationsService } from "./applications.service";
import { ApplicationsController } from "./applications.controller";
import { Application } from "./entities/application.entity";
import { Job } from "../jobs/entities/job.entity";
import { PermissionsModule } from "src/permissions/permissions.module";
import { ResumeS3Service } from "../../resume_collection/resume-s3.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, Job]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ResumeS3Service],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
