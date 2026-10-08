import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { CeoComplaint } from "./entities/ceo-complaint.entity";
import { CeoComplaintsService } from "./ceo-complaints.service";
import { CeoComplaintsController } from "./ceo-complaints.controller";
import { CeoComplaintsPublicController } from "./ceo-complaints-public.controller";
import { OriginAllowlistGuard } from "./guards/origin-allowlist.guard";
import { PermissionsModule } from "src/permissions";
import { AuthModule } from "src/auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CeoComplaint]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    AuthModule,
  ],
  controllers: [CeoComplaintsPublicController, CeoComplaintsController],
  providers: [CeoComplaintsService, OriginAllowlistGuard],
  exports: [CeoComplaintsService],
})
export class CeoComplaintsModule {}
