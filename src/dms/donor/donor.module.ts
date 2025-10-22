import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DonorService } from './donor.service';
import { DonorController } from './donor.controller';
import { Donor } from './entities/donor.entity';
import { PermissionsModule } from '../../permissions/permissions.module';
import { User } from 'src/users/user.entity';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donor, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
    UsersModule,
  ],
  controllers: [DonorController],
  providers: [DonorService],
  exports: [DonorService, TypeOrmModule], // Export TypeOrmModule for Donor repository
})
export class DonorModule {}
