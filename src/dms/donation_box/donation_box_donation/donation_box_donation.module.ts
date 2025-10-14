import { Module } from '@nestjs/common';
import { DonationBoxDonationService } from './donation_box_donation.service';
import { DonationBoxDonationController } from './donation_box_donation.controller';
import { DonationBoxModule } from '../donation-box.module';
import { DonationBoxDonation } from './entities/donation_box_donation.entity';
import { DonationBox } from '../entities/donation-box.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PermissionsModule } from 'src/permissions';

@Module({
  imports: [TypeOrmModule.forFeature([DonationBox, DonationBoxDonation]),
  JwtModule.register({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    signOptions: { expiresIn: '24h' },
  }),
  PermissionsModule,

], 
  controllers: [DonationBoxDonationController],
  providers: [DonationBoxDonationService],
})
export class DonationBoxDonationModule {}
