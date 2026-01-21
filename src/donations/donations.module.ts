import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { PublicDonationsController } from './public-donations.controller';
import { MigrationController } from './migration.controller';
import { DonationsSummaryController } from './donations-summary.controller';
import { CommunicationController } from '../utils/controllers/communication.controller';
import { Donation } from './entities/donation.entity';
import { DonationInKind } from '../dms/donation_in_kind/entities/donation_in_kind.entity';
import { User } from '../users/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { EmailModule } from '../email/email.module';
import { PayfastService } from './payfast.service';
import { DonorModule } from '../dms/donor/donor.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsAppService } from 'src/utils/services/whatsapp.service';
import { RecurringDonation } from 'src/dms/recurring_donations/entities/recurring_donation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donation, DonationInKind, User, RecurringDonation]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
    EmailModule,
    DonorModule,
    NotificationsModule,
], 
  controllers: [DonationsController, PublicDonationsController, MigrationController, DonationsSummaryController, CommunicationController],
  providers: [DonationsService, PayfastService, WhatsAppService],
  exports: [DonationsService],
})
export class DonationsModule {}
