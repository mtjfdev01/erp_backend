import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateVolunteerDto } from './dto/create-volunteer.dto';
import { UpdateVolunteerDto } from './dto/update-volunteer.dto';
import { Volunteer } from './entities/volunteer.entity';

@Injectable()
export class VolunteerService {
  constructor(
    @InjectRepository(Volunteer)
    private readonly volunteerRepository: Repository<Volunteer>,
  ) {}

  async create(createVolunteerDto: CreateVolunteerDto): Promise<Volunteer> {
    const volunteer = this.volunteerRepository.create(createVolunteerDto);
    return await this.volunteerRepository.save(volunteer);
  }

  async findAll(): Promise<Volunteer[]> {
    return await this.volunteerRepository.find({
      where: { is_archived: false },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Volunteer> {
    const volunteer = await this.volunteerRepository.findOne({
      where: { id, is_archived: false },
    });
    if (!volunteer) {
      throw new NotFoundException(`Volunteer with ID ${id} not found`);
    }
    return volunteer;
  }

  async update(id: number, updateVolunteerDto: UpdateVolunteerDto): Promise<Volunteer> {
    const volunteer = await this.findOne(id);
    Object.assign(volunteer, updateVolunteerDto);
    return await this.volunteerRepository.save(volunteer);
  }

  async remove(id: number): Promise<void> {
    const volunteer = await this.findOne(id);
    volunteer.is_archived = true;
    await this.volunteerRepository.save(volunteer);
  }
}
