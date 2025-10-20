import { Module } from '@nestjs/common';
import { DmsCronsService } from './dms-crons.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [DmsCronsService],
})
export class DmsCronsModule {}
