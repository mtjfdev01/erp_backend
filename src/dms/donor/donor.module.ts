import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DonorService } from './donor.service';
import { DonorController } from './donor.controller';
import { Donor } from './entities/donor.entity';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donor]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
  ],
  controllers: [DonorController],
  providers: [DonorService],
  exports: [DonorService],
})
export class DonorModule {}
