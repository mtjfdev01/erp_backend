import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { City } from './entities/city.entity';
import { Region } from '../regions/entities/region.entity';
import { Country } from '../countries/entities/country.entity';

@Injectable()
export class CitiesService {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  async create(createCityDto: CreateCityDto): Promise<City> {
    try {
      // Validate that region exists
      const region = await this.regionRepository.findOne({
        where: { id: createCityDto.region_id }
      });

      if (!region) {
        throw new NotFoundException(`Region with ID ${createCityDto.region_id} not found`);
      }

      // Validate that country exists
      const country = await this.countryRepository.findOne({
        where: { id: createCityDto.country_id }
      });

      if (!country) {
        throw new NotFoundException(`Country with ID ${createCityDto.country_id} not found`);
      }

      // Check if city with same name already exists in the region
      const existingCity = await this.cityRepository.findOne({
        where: {
          name: createCityDto.name,
          region_id: createCityDto.region_id
        }
      });

      if (existingCity) {
        throw new ConflictException('City with this name already exists in this region');
      }

      const city = this.cityRepository.create(createCityDto);
      return await this.cityRepository.save(city);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new Error(`Failed to create city: ${error.message}`);
    }
  }

  async findAll(): Promise<City[]> {
    try {
      return await this.cityRepository.find({
        where: { is_active: true },
        order: { name: 'ASC' },
        relations: ['region', 'country', 'routes']
      });
    } catch (error) {
      throw new Error(`Failed to retrieve cities: ${error.message}`);
    }
  }

  async findByRegion(regionId: number): Promise<City[]> {
    try {
      return await this.cityRepository.find({
        where: { region_id: regionId, is_active: true },
        order: { name: 'ASC' },
        relations: ['region', 'country', 'routes']
      });
    } catch (error) {
      throw new Error(`Failed to retrieve cities for region: ${error.message}`);
    }
  }

  async findByCountry(countryId: number): Promise<City[]> {
    try {
      return await this.cityRepository.find({
        where: { country_id: countryId, is_active: true },
        order: { name: 'ASC' },
        relations: ['region', 'country', 'routes']
      });
    } catch (error) {
      throw new Error(`Failed to retrieve cities for country: ${error.message}`);
    }
  }

  async findOne(id: number): Promise<City> {
    try {
      const city = await this.cityRepository.findOne({
        where: { id },
        relations: ['region', 'country', 'routes']
      });

      if (!city) {
        throw new NotFoundException(`City with ID ${id} not found`);
      }

      return city;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve city: ${error.message}`);
    }
  }

  async update(id: number, updateCityDto: UpdateCityDto): Promise<City> {
    try {
      const city = await this.cityRepository.findOne({ where: { id } });
      
      if (!city) {
        throw new NotFoundException(`City with ID ${id} not found`);
      }

      // Validate region if updating region_id
      if (updateCityDto.region_id) {
        const region = await this.regionRepository.findOne({
          where: { id: updateCityDto.region_id }
        });

        if (!region) {
          throw new NotFoundException(`Region with ID ${updateCityDto.region_id} not found`);
        }
      }

      // Validate country if updating country_id
      if (updateCityDto.country_id) {
        const country = await this.countryRepository.findOne({
          where: { id: updateCityDto.country_id }
        });

        if (!country) {
          throw new NotFoundException(`Country with ID ${updateCityDto.country_id} not found`);
        }
      }

      // Check for conflicts if updating name
      if (updateCityDto.name) {
        const existingCity = await this.cityRepository.findOne({
          where: {
            name: updateCityDto.name,
            region_id: updateCityDto.region_id || city.region_id
          }
        });

        if (existingCity && existingCity.id !== id) {
          throw new ConflictException('City with this name already exists in this region');
        }
      }

      await this.cityRepository.update(id, updateCityDto);
      return await this.cityRepository.findOne({ where: { id } });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new Error(`Failed to update city: ${error.message}`);
    }
  }

  async remove(id: number): Promise<{ message: string }> {
    try {
      const city = await this.cityRepository.findOne({ where: { id } });
      
      if (!city) {
        throw new NotFoundException(`City with ID ${id} not found`);
      }

      // Soft delete by setting is_active to false
      await this.cityRepository.update(id, { is_active: false });
      
      return { message: 'City deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to deactivate city: ${error.message}`);
    }
  }
}
