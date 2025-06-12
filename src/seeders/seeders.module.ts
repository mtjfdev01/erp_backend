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
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ddr_db',
      ssl: process.env.SSL === 'production',
      autoLoadEntities: true,
      synchronize: true,
    }),
    UsersModule,
    TypeOrmModule.forFeature([User]), // Needed if UsersSeeder accesses User entity directly
  ],
  providers: [UsersSeeder],
})
export class SeedersModule {} 