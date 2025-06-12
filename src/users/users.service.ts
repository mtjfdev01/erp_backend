import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, Department } from './user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(email: string, password: string, department: Department, role: UserRole): Promise<User> {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      department,
      role,
    });

    return await this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new NotFoundException('Invalid credentials');
    }

    return user;
  }

  async seedUsers(): Promise<void> {
    const users = [
      {
        username: 'store_user',
        password: 'store123',
        department: 'store',
        role: 'user',
      },
      {
        username: 'procurements_user',
        password: 'procurements123',
        department: 'procurements',
        role: 'user',
      },
      {
        username: 'program_user',
        password: 'program123',
        department: 'program',
        role: 'user',
      },
      {
        username: 'finance_user',
        password: 'finance123',
        department: 'accounts_and_finance',
        role: 'user',
      },
      {
        username: 'admin',
        password: 'admin123',
        department: 'store', // Admin can access all departments
        role: 'admin',
      },
    ];

    for (const user of users) {
      try {
        await this.create(user.username, user.password, Department[user.department.toUpperCase()], UserRole[user.role.toUpperCase()]);
      } catch (error) {
        if (error instanceof ConflictException) {
          console.log(`User ${user.username} already exists`);
        } else {
          throw error;
        }
      }
    }
  }
} 