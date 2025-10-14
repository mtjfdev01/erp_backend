import { Injectable } from '@nestjs/common';
import { CreateDonationInKindItemDto } from './dto/create-donation_in_kind_item.dto';
import { UpdateDonationInKindItemDto } from './dto/update-donation_in_kind_item.dto';

@Injectable()
export class DonationInKindItemsService {
  create(createDonationInKindItemDto: CreateDonationInKindItemDto) {
    return 'This action adds a new donationInKindItem';
  }

  findAll() {
    return `This action returns all donationInKindItems`;
  }

  findOne(id: number) {
    return `This action returns a #${id} donationInKindItem`;
  }

  update(id: number, updateDonationInKindItemDto: UpdateDonationInKindItemDto) {
    return `This action updates a #${id} donationInKindItem`;
  }

  remove(id: number) {
    return `This action removes a #${id} donationInKindItem`;
  }
}
