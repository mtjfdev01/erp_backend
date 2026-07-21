import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { User } from "./user.entity";
import { PermissionsEntity } from "../permissions/entities/permissions.entity";
import { JwtModule } from "@nestjs/jwt";
import { UsersController } from "./user.controller";
import { PermissionsModule } from "../permissions/permissions.module";
import { GeographicAssignmentModule } from "../dms/geographic/geographic-assignment/geographic-assignment.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PermissionsEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    GeographicAssignmentModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
