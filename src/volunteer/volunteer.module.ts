import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VolunteerService } from './volunteer.service';
import { VolunteerController } from './volunteer.controller';
import { Volunteer } from './entities/volunteer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Volunteer])],
  controllers: [VolunteerController],
  providers: [VolunteerService],
  exports: [VolunteerService],
})
export class VolunteerModule {}
