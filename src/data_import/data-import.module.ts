import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DataImportController } from "./data-import.controller";
import { DataImportService } from "./data-import.service";
import { DonorsImportHandler } from "./handlers/donors-import.handler";
import { DonorModule } from "../dms/donor/donor.module";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [
    DonorModule,
    PermissionsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
  ],
  controllers: [DataImportController],
  providers: [DataImportService, DonorsImportHandler],
  exports: [DataImportService],
})
export class DataImportModule {}
