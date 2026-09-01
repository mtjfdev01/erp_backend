import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateSubRegionDto } from "./dto/create-sub-region.dto";
import { UpdateSubRegionDto } from "./dto/update-sub-region.dto";
import { SubRegion } from "./entities/sub-region.entity";
import { Region } from "../regions/entities/region.entity";
import { Country } from "../countries/entities/country.entity";

@Injectable()
export class SubRegionsService {
  constructor(
    @InjectRepository(SubRegion)
    private readonly subRegionRepository: Repository<SubRegion>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  async create(createSubRegionDto: CreateSubRegionDto): Promise<SubRegion> {
    const region = await this.regionRepository.findOne({
      where: { id: createSubRegionDto.region_id },
    });
    if (!region) {
      throw new NotFoundException(
        `Region with ID ${createSubRegionDto.region_id} not found`,
      );
    }

    const country = await this.countryRepository.findOne({
      where: { id: createSubRegionDto.country_id },
    });
    if (!country) {
      throw new NotFoundException(
        `Country with ID ${createSubRegionDto.country_id} not found`,
      );
    }

    const existing = await this.subRegionRepository.findOne({
      where: {
        name: createSubRegionDto.name,
        region_id: createSubRegionDto.region_id,
      },
    });
    if (existing) {
      throw new ConflictException(
        "Sub region with this name already exists in this region",
      );
    }

    const row = this.subRegionRepository.create(createSubRegionDto);
    return this.subRegionRepository.save(row);
  }

  async findAll(): Promise<SubRegion[]> {
    return this.subRegionRepository.find({
      where: { is_active: true },
      order: { name: "ASC" },
      relations: ["region", "country", "districts"],
    });
  }

  async findByRegion(regionId: number): Promise<SubRegion[]> {
    return this.subRegionRepository.find({
      where: { region_id: regionId, is_active: true },
      order: { name: "ASC" },
      relations: ["region", "country", "districts"],
    });
  }

  async findByCountry(countryId: number): Promise<SubRegion[]> {
    return this.subRegionRepository.find({
      where: { country_id: countryId, is_active: true },
      order: { name: "ASC" },
      relations: ["region", "country", "districts"],
    });
  }

  async findOne(id: number): Promise<SubRegion> {
    const row = await this.subRegionRepository.findOne({
      where: { id },
      relations: ["region", "country", "districts"],
    });
    if (!row) {
      throw new NotFoundException(`Sub region with ID ${id} not found`);
    }
    return row;
  }

  async update(
    id: number,
    updateSubRegionDto: UpdateSubRegionDto,
  ): Promise<SubRegion> {
    const row = await this.subRegionRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Sub region with ID ${id} not found`);
    }

    if (updateSubRegionDto.region_id) {
      const region = await this.regionRepository.findOne({
        where: { id: updateSubRegionDto.region_id },
      });
      if (!region) {
        throw new NotFoundException(
          `Region with ID ${updateSubRegionDto.region_id} not found`,
        );
      }
    }

    if (updateSubRegionDto.country_id) {
      const country = await this.countryRepository.findOne({
        where: { id: updateSubRegionDto.country_id },
      });
      if (!country) {
        throw new NotFoundException(
          `Country with ID ${updateSubRegionDto.country_id} not found`,
        );
      }
    }

    if (updateSubRegionDto.name) {
      const existing = await this.subRegionRepository.findOne({
        where: {
          name: updateSubRegionDto.name,
          region_id: updateSubRegionDto.region_id || row.region_id,
        },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          "Sub region with this name already exists in this region",
        );
      }
    }

    await this.subRegionRepository.update(id, updateSubRegionDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<{ message: string }> {
    const row = await this.subRegionRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Sub region with ID ${id} not found`);
    }
    await this.subRegionRepository.update(id, { is_active: false });
    return { message: "Sub region deactivated successfully" };
  }
}
