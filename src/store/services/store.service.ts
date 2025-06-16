import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreEntity } from '../entities/store.entity/store.entity';
import { CreateStoreDto } from '../dto/create-store.dto/create-store.dto';
import { User, UserRole } from '../../users/user.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(StoreEntity)
    private storeRepository: Repository<StoreEntity>,
  ) {}

  async create(createDto: CreateStoreDto, user: User) {
    const entity = this.storeRepository.create(createDto);
    return this.storeRepository.save(entity);
  }

  async findAll(user: User) {
    if (user.role === UserRole.ADMIN) {
      return this.storeRepository.find();
    }
    return this.storeRepository.find();
  }

  async findOne(id: number, user: User) {
    const entity = await this.storeRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Store record not found');
    }
    return entity;
  }

  async update(id: number, updateDto: Partial<CreateStoreDto>, user: User) {
    const entity = await this.findOne(id, user);
    await this.storeRepository.update(id, updateDto);
    return this.findOne(id, user);
  }

  async remove(id: number, user: User) {
    const entity = await this.findOne(id, user);
    return this.storeRepository.remove(entity);
  }
}
