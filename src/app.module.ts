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
import { DmsCronsModule } from './crons/dms_crons/dms-crons.module';
import { DonationsReportModule } from './crons/donations_report/donations-report.module';
import { GeographicModule } from './dms/geographic/geographic.module';
import { MessagesModule } from './website/messages/messages.module';
import { NewsletterModule } from './website/newsletter/newsletter.module';
import { VolunteerModule } from './volunteer/volunteer.module';
import { EmailModule } from './email/email.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GoldSilverPriceModule } from './zakat/gold_silver_price/gold_silver_price.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QrCodeModule } from './qr_code/qr_code.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available globally
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      // host: process.env.DB_HOST,
      // port: parseInt(process.env.DB_PORT), 
      // username: process.env.DB_USERNAME,
      // password: process.env.DB_PASSWORD,
      // database: process.env.DB_NAME,

      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ddr_db',
      // ssl: process.env.SSL === 'production',
      autoLoadEntities: true,
      synchronize: true,
      extra: {
        max: 5,
        connectionTimeoutMillis: 15000,
        query_timeout: 60000,
        statement_timeout: 60000,
      }      
    }),
    ScheduleModule.forRoot(), // Enable cron jobs globally
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
    DmsCronsModule,
    DonationsReportModule,
    GeographicModule,
    MessagesModule,
    NewsletterModule,
    VolunteerModule,
    EmailModule,
    NotificationsModule,
    GoldSilverPriceModule,
    QrCodeModule
    ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}