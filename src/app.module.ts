import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StoreModule } from './store/store.module';
import { ProcurementsModule } from './procurements/procurements.module';
import { ProgramModule } from './program/program.module';
import { AccountsAndFinanceModule } from './accounts-and-finance/accounts-and-finance.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { PermissionsModule } from './permissions/permissions.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DonationsModule } from './donations/donations.module';
import { DmsModule } from './dms/dms.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available globally
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT), 
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,

      // url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ddr_db',
      // ssl: process.env.SSL === 'production',
      autoLoadEntities: true,
      synchronize: true 
    }),
    StoreModule,
    ProcurementsModule,
    ProgramModule,
    AccountsAndFinanceModule,
    AuthModule,
    UsersModule,
    AdminModule,
    PermissionsModule,
    EventEmitterModule.forRoot(),
    DonationsModule,
    DmsModule,
    ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}