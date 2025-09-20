import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { Donation } from './entities/donation.entity';
import { JwtModule } from '@nestjs/jwt';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { EmailModule } from '../email/email.module';
import { PayfastService } from './payfast.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donation]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
    EmailModule
], 
  controllers: [DonationsController],
  providers: [DonationsService, PayfastService],
  exports: [DonationsService],
})
export class DonationsModule {}
