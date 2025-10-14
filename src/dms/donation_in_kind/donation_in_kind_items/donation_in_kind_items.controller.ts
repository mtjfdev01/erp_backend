import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DonationInKindItemsService } from './donation_in_kind_items.service';
import { CreateDonationInKindItemDto } from './dto/create-donation_in_kind_item.dto';
import { UpdateDonationInKindItemDto } from './dto/update-donation_in_kind_item.dto';

@Controller('donation-in-kind-items')
export class DonationInKindItemsController {
  constructor(private readonly donationInKindItemsService: DonationInKindItemsService) {}

  @Post()
  create(@Body() createDonationInKindItemDto: CreateDonationInKindItemDto) {
    return this.donationInKindItemsService.create(createDonationInKindItemDto);
  }

  @Get()
  findAll() {
    return this.donationInKindItemsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.donationInKindItemsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDonationInKindItemDto: UpdateDonationInKindItemDto) {
    return this.donationInKindItemsService.update(+id, updateDonationInKindItemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.donationInKindItemsService.remove(+id);
  }
}
