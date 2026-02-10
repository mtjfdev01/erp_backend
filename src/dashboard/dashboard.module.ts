import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Donation } from '../donations/entities/donation.entity';
import { DonationBoxDonation } from '../dms/donation_box/donation_box_donation/entities/donation_box_donation.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import {
  DashboardMonthlyAgg,
  DashboardEventAgg,
  DashboardMonthDonorUnique,
  DashboardMonthEvents,
} from './entities';
import { DashboardAggregateService } from './dashboard-aggregate.service';
import { DashboardRebuildService } from './dashboard-rebuild.service';
import { DashboardRebuildCronService } from './dashboard-rebuild-cron.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Donation,
      DonationBoxDonation,
      DashboardMonthlyAgg,
      DashboardEventAgg,
      DashboardMonthDonorUnique,
      DashboardMonthEvents,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardAggregateService,
    DashboardRebuildService,
    DashboardRebuildCronService,
  ],
  exports: [DashboardAggregateService],
})
export class DashboardModule {}
