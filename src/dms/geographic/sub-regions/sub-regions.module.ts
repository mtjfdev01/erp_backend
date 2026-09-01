import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SubRegionsService } from "./sub-regions.service";
import { SubRegionsController } from "./sub-regions.controller";
import { SubRegion } from "./entities/sub-region.entity";
import { Region } from "../regions/entities/region.entity";
import { Country } from "../countries/entities/country.entity";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";

@Module({
  imports: [
    TypeOrmModule.forFeature([SubRegion, Region, Country]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [SubRegionsController],
  providers: [SubRegionsService],
  exports: [SubRegionsService, TypeOrmModule],
})
export class SubRegionsModule {}
