import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { UsersSeeder } from './users.seeder';
import { User } from '../users/user.entity';
import { kill } from 'process';

console.log("process.env.DATABASE_URL", process.env.DATABASE_URL);
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
      // ssl: process.env.SSL === 'production',
      autoLoadEntities: true,
      synchronize: false
    }),
    UsersModule,
    TypeOrmModule.forFeature([User]), // Needed if UsersSeeder accesses User entity directly
  ],
  providers: [UsersSeeder],
})
export class SeedersModule {} 