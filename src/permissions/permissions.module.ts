import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PermissionsService } from "./permissions.service";
import { PermissionsGuard } from "./guards/permissions.guard";
import { PermissionsController } from "./permissions.controller";
// import { PermissionsSeeder } from './seeder/permissions.seeder';
import { PermissionsEntity } from "./entities/permissions.entity";
import { User } from "../users/user.entity";
import { DataScopeService } from "./data-scope/data-scope.service";

@Module({
  imports: [TypeOrmModule.forFeature([PermissionsEntity, User])],
  controllers: [PermissionsController],
  providers: [
    PermissionsService,
    PermissionsGuard,
    DataScopeService,
    // PermissionsSeeder,
  ],
  exports: [
    PermissionsService,
    PermissionsGuard,
    DataScopeService,
    // PermissionsSeeder,
  ],
})
export class PermissionsModule {}
