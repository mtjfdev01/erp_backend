import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { UploadPostService } from "./upload_post.service";
import { UploadPostController } from "./upload_post.controller";
import { UploadPost } from "./entities/upload-post.entity";
import { UploadPostClient } from "./upload-post.client";
import { PermissionsModule } from "src/permissions";
import { S3StorageModule } from "../../utils/storage/s3-storage.module";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UploadPost]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    PermissionsModule,
    S3StorageModule,
  ],
  controllers: [UploadPostController],
  providers: [UploadPostService, UploadPostClient],
  exports: [UploadPostService],
})
export class UploadPostModule {}
