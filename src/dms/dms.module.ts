import { Module } from '@nestjs/common';
import { DmsService } from './dms.service';
import { DmsController } from './dms.controller';
import { DonorModule } from './donor/donor.module';
import { UserDonorsModule } from './user_donors/user_donors.module';
import { PermissionsModule } from 'src/permissions';
import { JwtModule } from '@nestjs/jwt';

@Module({
  controllers: [DmsController],
  providers: [DmsService],
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    PermissionsModule,
    DonorModule, UserDonorsModule],        
})
export class DmsModule {}
