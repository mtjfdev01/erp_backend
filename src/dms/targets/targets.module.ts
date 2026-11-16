import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "src/permissions";
import { User } from "../../users/user.entity";
import { UserTarget } from "./entities/user-target.entity";
import { TargetsService } from "./targets.service";
import { TargetsController } from "./targets.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserTarget, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
  ],
  controllers: [TargetsController],
  providers: [TargetsService],
  exports: [TargetsService],
})
export class TargetsModule {}
