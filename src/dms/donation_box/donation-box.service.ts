import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DonationBox } from './entities/donation-box.entity';
import { CreateDonationBoxDto } from './dto/create-donation-box.dto';
import { UpdateDonationBoxDto } from './dto/update-donation-box.dto';
import { applyCommonFilters, FilterPayload } from '../../utils/filters/common-filter.util';
import { Route } from '../geographic/routes/entities/route.entity';
import { User } from '../../users/user.entity';

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
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Create a new donation box
   */
  async create(createDonationBoxDto: CreateDonationBoxDto, currentUser: any): Promise<DonationBox> {
    try {
      // Validate that route exists
      const route = await this.routeRepository.findOne({
        where: { id: createDonationBoxDto.route_id }
      });

      if (!route) {
        throw new NotFoundException(`Route with ID ${createDonationBoxDto.route_id} not found`);
      }


      // Validate assigned users if provided
      let assignedUsers: User[] = [];
      if (createDonationBoxDto.assigned_user_ids && createDonationBoxDto.assigned_user_ids.length > 0) {
        assignedUsers = await this.userRepository.findBy({ id: In(createDonationBoxDto.assigned_user_ids) });
        
        if (assignedUsers.length !== createDonationBoxDto.assigned_user_ids.length) {
          const foundIds = assignedUsers.map(user => user.id);
          const missingIds = createDonationBoxDto.assigned_user_ids.filter(id => !foundIds.includes(id));
          throw new NotFoundException(`Users with IDs ${missingIds.join(', ')} not found`);
        }
      }

      // Create donation box entity
      const { assigned_user_ids, ...boxData } = createDonationBoxDto;
      const donationBox = this.donationBoxRepository.create({
        ...boxData,
        created_by: currentUser?.id == -1 ? null : currentUser?.id,
        assignedUsers: assignedUsers,
      });

      // Save and return
      const savedBox = await this.donationBoxRepository.save(donationBox);
      
      return savedBox;
    } catch (error) {
      console.error('Error creating donation box:', error);
      throw new Error(`Failed to create donation box: ${error.message}`);
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

      // Define searchable fields (only string fields that can be used with LOWER())
      const searchFields = [
        'key_no',
        'shop_name',
        'shopkeeper',
        'cell_no',
        'landmark_marketplace',
        'route.name', // Search in route name from joined table
      ];

      // Build query with filters and relations
      const query = this.donationBoxRepository.createQueryBuilder('donation_box')
        .leftJoinAndSelect('donation_box.route', 'route')
        .leftJoinAndSelect('route.cities', 'cities')
        .leftJoinAndSelect('route.region', 'region')
        .leftJoinAndSelect('route.country', 'country')
        .leftJoinAndSelect('donation_box.assignedUsers', 'assignedUsers');
        
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
      console.error('Error retrieving donation boxes:', error);
      throw new Error(`Failed to retrieve donation boxes: ${error.message}`);
    }
  }

  /**
   * Find one donation box by ID
   */
  async findOne(id: number): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({ 
        where: { id },
        relations: ['route', 'route.cities', 'route.region', 'route.country', 'assignedUsers']
      });
      
      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }
      
      return donationBox;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error retrieving donation box:', error.message);
      throw new NotFoundException(`Failed to retrieve donation box: ${error.message}`);
    }
  }

  /**
   * Update a donation box
   */
  async update(id: number, updateDonationBoxDto: any): Promise<DonationBox> {
    try {
      const donationBox = await this.donationBoxRepository.findOne({ where: { id } });
      
      if (!donationBox) {
        throw new NotFoundException(`Donation box with ID ${id} not found`);
      }

      // Validate route if it's being updated
      if (updateDonationBoxDto.route_id) {
        const route = await this.routeRepository.findOne({
          where: { id: updateDonationBoxDto.route_id }
        });

        if (!route) {
          throw new NotFoundException(`Route with ID ${updateDonationBoxDto.route_id} not found`);
        }
      }

      // Handle user assignments if provided
      if (updateDonationBoxDto.assigned_user_ids !== undefined) {
        let assignedUsers: User[] = [];
        if (updateDonationBoxDto.assigned_user_ids && updateDonationBoxDto.assigned_user_ids.length > 0) {
          assignedUsers = await this.userRepository.findBy({ id: In(updateDonationBoxDto.assigned_user_ids) });
          
          if (assignedUsers.length !== updateDonationBoxDto.assigned_user_ids.length) {
            const foundIds = assignedUsers.map(user => user.id);
            const missingIds = updateDonationBoxDto.assigned_user_ids.filter(id => !foundIds.includes(id));
            throw new NotFoundException(`Users with IDs ${missingIds.join(', ')} not found`);
          }
        }

        // Update user assignments
        const donationBox = await this.donationBoxRepository.findOne({ 
          where: { id },
          relations: ['assignedUsers']
        });
        donationBox.assignedUsers = assignedUsers;
        await this.donationBoxRepository.save(donationBox);
      }

      // Update other entity properties
      const { assigned_user_ids, ...updateData } = updateDonationBoxDto;
      if (Object.keys(updateData).length > 0) {
        await this.donationBoxRepository.update(id, updateData);
      }
      
      // Return updated entity with relations
      return await this.donationBoxRepository.findOne({ 
        where: { id },
        relations: ['route', 'route.cities', 'route.region', 'route.country', 'assignedUsers']
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating donation box:', error.message);
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
      console.error('Error archiving donation box:', error.message);
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
      console.error('Error updating collection statistics:', error.message);
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
          route: {
            region: {
              name: region,
            },
          },
          is_active: true,
          is_archived: false,
        },
        order: { shop_name: 'ASC' },
      });
    } catch (error) {
      console.error('Error retrieving active boxes:', error.message);
      throw new Error(`Failed to retrieve active boxes: ${error.message}`);
    }
  }

  // i want to get by key number
  async findByKeyNumber(key_number: string): Promise<DonationBox> {
    try {
      return await this.donationBoxRepository.findOne({ where: { key_no: key_number } });
    } catch (error) {
      console.error('Error retrieving donation box by key number:', error);
      throw new Error(`Failed to retrieve donation box by key number: ${error.message}`);
    }
  }
}

