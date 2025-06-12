import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { StoreEntity } from '../store/entities/store.entity/store.entity';
import { ProcurementsEntity } from '../procurements/entities/procurements.entity/procurements.entity';
import { AccountsAndFinanceEntity } from '../accounts-and-finance/entities/accounts-and-finance.entity/accounts-and-finance.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreEntity,
      ProcurementsEntity,
      AccountsAndFinanceEntity,
    ]),
    AuthModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
