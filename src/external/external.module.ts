import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ExternalController } from "./external.controller";
import { ExternalApiKeysController } from "./external-api-keys.controller";
import { ExternalApiKeyGuard } from "./guards/external-api-key.guard";
import { ExternalApiKeysService } from "./external-api-keys.service";
import { ExternalApiKey } from "./entities/external-api-key.entity";
import { DonationsModule } from "../donations/donations.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalApiKey]),
    DonationsModule,
    PermissionsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
  ],
  controllers: [ExternalController, ExternalApiKeysController],
  providers: [ExternalApiKeyGuard, ExternalApiKeysService],
  exports: [ExternalApiKeysService],
})
export class ExternalModule {}
