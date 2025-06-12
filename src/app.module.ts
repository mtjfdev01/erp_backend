import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StoreModule } from './store/store.module';
import { ProcurementsModule } from './procurements/procurements.module';
// import { ProgramModule } from './program/program.module';
import { AccountsAndFinanceModule } from './accounts-and-finance/accounts-and-finance.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/user.entity';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ddr_db',
      ssl: process.env.SSL === 'production',
      autoLoadEntities: true,
      // host: process.env.DB_HOST || 'localhost',
      // port: parseInt(process.env.DB_PORT) || 5432,
      // username: process.env.DB_USERNAME || 'postgres',
      // password: process.env.DB_PASSWORD || 'postgres',
      // database: process.env.DB_DATABASE || 'ddr_db',
      // entities: [User],
      synchronize: true
    }),
    StoreModule,
    ProcurementsModule,
    // ProgramModule,
    AccountsAndFinanceModule,
    AuthModule,
    UsersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}