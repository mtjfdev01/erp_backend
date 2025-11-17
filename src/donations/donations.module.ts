import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { PublicDonationsController } from './public-donations.controller';
import { MigrationController } from './migration.controller';
import { DonationsSummaryController } from './donations-summary.controller';
import { Donation } from './entities/donation.entity';
import { DonationInKind } from '../dms/donation_in_kind/entities/donation_in_kind.entity';
import { JwtModule } from '@nestjs/jwt';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { EmailModule } from '../email/email.module';
import { PayfastService } from './payfast.service';
import { DonorModule } from '../dms/donor/donor.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donation, DonationInKind]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
    EmailModule,
    DonorModule,
], 
  controllers: [DonationsController, PublicDonationsController, MigrationController, DonationsSummaryController],
  providers: [DonationsService, PayfastService],
  exports: [DonationsService],
})
export class DonationsModule {}
