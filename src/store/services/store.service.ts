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
    const entity = this.storeRepository.create({
      ...createDto,
      createdBy: user.id,
    });
    return this.storeRepository.save(entity);
  }

  async findAll(user: User) {
    if (user.role === UserRole.ADMIN) {
      return this.storeRepository.find();
    }
    return this.storeRepository.find({ where: { createdBy: user.id } });
  }

  async findOne(id: number, user: User) {
    const entity = await this.storeRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Store record not found');
    }
    
    if (user.role !== UserRole.ADMIN && entity.createdBy !== user.id) {
      throw new ForbiddenException('You do not have access to this record');
    }
    
    return entity;
  }

  async update(id: number, updateDto: Partial<CreateStoreDto>, user: User) {
    const entity = await this.findOne(id, user);
    
    if (user.role !== UserRole.ADMIN && entity.createdBy !== user.id) {
      throw new ForbiddenException('You do not have permission to update this record');
    }
    
    await this.storeRepository.update(id, updateDto);
    return this.findOne(id, user);
  }

  async remove(id: number, user: User) {
    const entity = await this.findOne(id, user);
    
    if (user.role !== UserRole.ADMIN && entity.createdBy !== user.id) {
      throw new ForbiddenException('You do not have permission to delete this record');
    }
    
    return this.storeRepository.remove(entity);
  }
}
