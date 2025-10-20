import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DmsCronsService {
  private readonly logger = new Logger(DmsCronsService.name);

  // @Cron(CronExpression.EVERY_MINUTE) // Disabled by commenting out
  handleCron() {
    try{
    this.logger.log('Cron is run');
    }
    catch(error) {
        console.log("Cron_name: Error", error.message);
    }
  }
}
