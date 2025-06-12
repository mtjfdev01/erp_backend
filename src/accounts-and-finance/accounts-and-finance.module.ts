import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsAndFinanceController } from './accounts-and-finance.controller';
import { AccountsAndFinanceService } from './services/accounts-and-finance.service';
import { AccountsAndFinanceEntity } from './entities/accounts-and-finance.entity/accounts-and-finance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountsAndFinanceEntity])],
  controllers: [AccountsAndFinanceController],
  providers: [AccountsAndFinanceService]
})
export class AccountsAndFinanceModule {}
