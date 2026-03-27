import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { UsersSeeder } from './users.seeder';
import { User } from '../users/user.entity';
import { DonationBoxModule } from '../dms/donation_box/donation-box.module';
import { GeographicModule } from '../dms/geographic/geographic.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      // host: process.env.DB_HOST,
      // port: parseInt(process.env.DB_PORT),
      // username: process.env.DB_USERNAME,
      // password: process.env.DB_PASSWORD,
      // database: process.env.DB_NAME,
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ddr_db',
      ssl: process.env.SSL === 'production',
      autoLoadEntities: true,
      synchronize: false
    }),
    UsersModule,
    DonationBoxModule,
    GeographicModule,
    TypeOrmModule.forFeature([User]), // Needed if UsersSeeder accesses User entity directly
  ],
  providers: [UsersSeeder],
})
export class SeedersModule {} 