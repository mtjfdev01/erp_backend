import { Module } from '@nestjs/common';
import { DonationInKindItemsService } from './donation_in_kind_items.service';
import { DonationInKindItemsController } from './donation_in_kind_items.controller';

@Module({
  controllers: [DonationInKindItemsController],
  providers: [DonationInKindItemsService],
})
export class DonationInKindItemsModule {}
