import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { StoreEntity } from '../store/entities/store.entity/store.entity';
import { ProcurementsEntity } from '../procurements/entities/procurements.entity/procurements.entity';
import { AccountsAndFinanceEntity } from '../accounts-and-finance/entities/accounts-and-finance.entity/accounts-and-finance.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(StoreEntity)
    private readonly storeRepository: Repository<StoreEntity>,
    @InjectRepository(ProcurementsEntity)
    private readonly procurementsRepository: Repository<ProcurementsEntity>,
    @InjectRepository(AccountsAndFinanceEntity)
    private readonly accountsAndFinanceRepository: Repository<AccountsAndFinanceEntity>,
  ) {}

  async generateDailyReport(fromDate: Date, toDate: Date) {
    const dateFilter = {
      date: Between(fromDate, toDate)
    };

    const [accountsAndFinanceData, procurementsData, storeData ] = await Promise.all([
      this.accountsAndFinanceRepository.findOne({ where: dateFilter, order: { date: 'DESC' } }),
      this.procurementsRepository.findOne({ where: dateFilter, order: { date: 'DESC' } }),
      this.storeRepository.findOne({ where: dateFilter, order: { date: 'DESC' } }),
    ]);

    return {
      accounts_and_finance: accountsAndFinanceData,
      procurements: procurementsData,
      store: storeData,
    };
  }
} 