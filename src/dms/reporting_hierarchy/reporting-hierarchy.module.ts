import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";
import { User } from "src/users/user.entity";
import { ReportingEdge } from "./entities/reporting-edge.entity";
import { ReportingHierarchyService } from "./reporting-hierarchy.service";
import { ReportingHierarchyController } from "./reporting-hierarchy.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportingEdge, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [ReportingHierarchyController],
  providers: [ReportingHierarchyService],
  exports: [ReportingHierarchyService],
})
export class ReportingHierarchyModule {}
