import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonationBox } from './entities/donation-box.entity';
import { CreateDonationBoxDto } from './dto/create-donation-box.dto';
import { UpdateDonationBoxDto } from './dto/update-donation-box.dto';
import { applyCommonFilters, FilterPayload } from '../../utils/filters/common-filter.util';

interface PaginationOptions {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
  region?: string;
  city?: string;
  box_type?: string;
  status?: string;
  frequency?: string;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class DonationBoxService {
  constructor(
    @InjectRepository(DonationBox)
    private readonly donationBoxRepository: Repository<DonationBox>,
  ) {}

  /**
   * Create a new donation box
   */
  async create(createDonationBoxDto: CreateDonationBoxDto): Promise<DonationBox> {
    try {
      // Check if box_id_no already exists
      const existingBox = await this.donationBoxRepository.findOne({
        where: { box_id_no: createDonationBoxDto.box_id_no },
      });

      if (existingBox) {
        throw new ConflictException('Box ID already exists');
      }

      // Create donation box entity
      const donationBox = this.donationBoxRepository.create(createDonationBoxDto);

      // Save and return
      const savedBox = await this.donationBoxRepository.save(donationBox);
      
      return savedBox;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ConflictException(`Failed to create donation box: ${error.message}`);
    }
  }

  /**
   * Find all donation boxes with pagination and filtering
   */
  async findAll(options: PaginationOptions) {
    try {
      const {
        page = 1,
        pageSize = 10,
        sortField = 'created_at',
        sortOrder = 'DESC',
        search = '',
        region = '',
        city = '',
        box_type = '',
        status = '',
        frequency = '',
        is_active,
        start_date,
        end_date,
      } = options;

      const skip = (page - 1) * pageSize;

      // Define searchable fields
      const searchFields = [
        'box_id_no',
        'key_no',
        'shop_name',
        'shopkeeper',
        'cell_no',
        'landmark_marketplace',
        'route',
        'frd_officer_reference',
      ];

      // Build query with filters
      const query = this.donationBoxRepository.createQueryBuilder('donation_box');

      // Apply common filters
      const filters: FilterPayload = {
        search,
        region,
        city,
        box_type,
        status,
        frequency,
        start_date,
        end_date,
      };

      if (is_active !== undefined) {
        filters.is_active = is_active;
      }

      applyCommonFilters(query, filters, searchFields, 'donation_box');

      // Apply sorting
      query.orderBy(`donation_box.${sortField}`, sortOrder);

      // Apply pagination
      query.skip(skip).take(pageSize);

      // Execute query
      const [data, total] = await query.getManyAndCount();
      const totalPages = Math.ceil(total / pageSize);

      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new Error(`Failed to retrieve donation boxes: ${error.message}`);
    }
  }

  /**
   * Find one donation box by ID
   */
  async findOne(id: number): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({ where: { id } });
      
      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }
      
      return donationBox;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Failed to retrieve donation box: ${error.message}`);
    }
  }

  /**
   * Find donation box by box_id_no
   */
  async findByBoxIdNo(box_id_no: string): Promise<DonationBox | null> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({
        where: { box_id_no },
      });
      
      return donationBox || null;
    } catch (error) {
      console.error('Error finding donation box by box_id_no:', error);
      return null;
    }
  }

  /**
   * Update a donation box
   */
  async update(id: number, updateDonationBoxDto: UpdateDonationBoxDto): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({ where: { id } });
      
      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      // Update the entity
      await this.donationBoxRepository.update(id, updateDonationBoxDto);
      
      // Return updated entity
      return await this.donationBoxRepository.findOne({ where: { id } });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update donation box: ${error.message}`);
    }
  }

  /**
   * Soft delete a donation box (archive)
   */
  async remove(id: number) {
    try {
      const donationBox = await this.donationBoxRepository.findOne({ where: { id } });
      
      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      // Soft delete by setting is_archived to true
      await this.donationBoxRepository.update(id, { is_archived: true });
      
      return { message: 'Donation box archived successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to archive donation box: ${error.message}`);
    }
  }

  /**
   * Update collection statistics
   */
  async updateCollectionStats(id: number, amount: number) {
    try {
      const donationBox = await this.donationBoxRepository.findOne({ where: { id } });
      
      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      // Update statistics
      donationBox.total_collected = Number(donationBox.total_collected) + Number(amount);
      donationBox.collection_count = donationBox.collection_count + 1;
      donationBox.last_collection_date = new Date();

      await this.donationBoxRepository.save(donationBox);
      
      return donationBox;
    } catch (error) {
      throw new Error(`Failed to update collection statistics: ${error.message}`);
    }
  }

  /**
   * Get active boxes by region
   */
  async findActiveByRegion(region: string): Promise<DonationBox[]> {
    try {
      return await this.donationBoxRepository.find({
        where: {
          region,
          is_active: true,
          is_archived: false,
        },
        order: { city: 'ASC', shop_name: 'ASC' },
      });
    } catch (error) {
      throw new Error(`Failed to retrieve active boxes: ${error.message}`);
    }
  }
}

