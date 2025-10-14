import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonationBoxDonation } from './entities/donation_box_donation.entity';
import { CreateDonationBoxDonationDto } from './dto/create-donation_box_donation.dto';
import { UpdateDonationBoxDonationDto } from './dto/update-donation_box_donation.dto';
import { DonationBox } from '../entities/donation-box.entity';
import {
  applyCommonFilters,
  FilterPayload,
  applyHybridFilters,
  HybridFilter,
} from '../../../utils/filters/common-filter.util';

interface PaginationOptions {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
  donation_box_id?: number;
  status?: string;
  payment_method?: string;
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class DonationBoxDonationService {
  constructor(
    @InjectRepository(DonationBoxDonation)
    private readonly donationBoxDonationRepository: Repository<DonationBoxDonation>,
    @InjectRepository(DonationBox)
    private readonly donationBoxRepository: Repository<DonationBox>,
  ) {}

  /**
   * Create a new donation box collection record
   */
  async create(
    createDonationBoxDonationDto: CreateDonationBoxDonationDto,
  ): Promise<DonationBoxDonation> {
    try {
      // Validate that donation box exists
      const donationBox = await this.donationBoxRepository.findOne({
        where: { id: createDonationBoxDonationDto.donation_box_id },
      });

      if (!donationBox) {
        throw new NotFoundException(
          `Donation box with ID ${createDonationBoxDonationDto.donation_box_id} not found`,
        );
      }

      // Validate collection amount
      if (createDonationBoxDonationDto.collection_amount < 0) {
        throw new BadRequestException('Collection amount cannot be negative');
      }

      // Create the collection record
      const collection = this.donationBoxDonationRepository.create(
        createDonationBoxDonationDto,
      );

      const savedCollection = await this.donationBoxDonationRepository.save(
        collection,
      );

      // Update donation box statistics
      await this.updateDonationBoxStats(
        createDonationBoxDonationDto.donation_box_id,
        createDonationBoxDonationDto.collection_amount,
        new Date(createDonationBoxDonationDto.collection_date),
      );

      console.log(
        `✅ Collection recorded for donation box ID: ${createDonationBoxDonationDto.donation_box_id}, Amount: ${createDonationBoxDonationDto.collection_amount}`,
      );

      // Return with relations
      return await this.donationBoxDonationRepository.findOne({
        where: { id: savedCollection.id },
        relations: ['donation_box', 'collected_by', 'verified_by'],
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new Error(`Failed to create collection record: ${error.message}`);
    }
  }

  /**
   * Find all collections with pagination and filtering
   */
  async findAll(options: PaginationOptions) {
    try {
      const {
        page = 1,
        pageSize = 10,
        sortField = 'collection_date',
        sortOrder = 'DESC',
        search = '',
        donation_box_id,
        status = '',
        payment_method = '',
        start_date,
        end_date,
      } = options;

      const skip = (page - 1) * pageSize;

      // Define searchable fields
      const searchFields = [
        'collector_name',
        'notes',
        'bank_deposit_slip_no',
        'receipt_number',
        'cheque_number',
        'bank_name',
      ];

      console.log("HJEREROOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO 1231231")

      // Build query with relations
      const query = this.donationBoxDonationRepository
        .createQueryBuilder('donation_box_donation')
        .leftJoinAndSelect('donation_box_donation.donation_box', 'donation_box')
        .leftJoinAndSelect('donation_box_donation.collected_by', 'collected_by')
        .leftJoinAndSelect('donation_box_donation.verified_by', 'verified_by');

      // Apply common filters
      const filters: FilterPayload = {
        search,
        status,
        payment_method,
        start_date,
        end_date,
      };

      if (donation_box_id) {
        filters.donation_box_id = donation_box_id;
      }

      applyCommonFilters(
        query,
        filters,
        searchFields,
        'donation_box_donation',
      );

      // Apply sorting (whitelist to prevent SQL injection)
      const allowedSortFields = [
        'collection_date',
        'collection_amount',
        'created_at',
        'status',
        'deposit_date',
      ];
      const safeSortField = allowedSortFields.includes(sortField)
        ? sortField
        : 'collection_date';
      query.orderBy(`donation_box_donation.${safeSortField}`, sortOrder);

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
      throw new Error(
        `Failed to retrieve collection records: ${error.message}`,
      );
    }
  }

  /**
   * Find one collection by ID
   */
  async findOne(id: number): Promise<DonationBoxDonation> {
    try {
      const collection = await this.donationBoxDonationRepository.findOne({
        where: { id },
        relations: ['donation_box', 'collected_by', 'verified_by'],
      });

      if (!collection) {
        throw new NotFoundException(
          `Collection record with ID ${id} not found`,
        );
      }

      return collection;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve collection record: ${error.message}`);
    }
  }

  /**
   * Get collections by donation box ID
   */
  async findByDonationBox(
    donationBoxId: number,
  ): Promise<DonationBoxDonation[]> {
    try {
      return await this.donationBoxDonationRepository.find({
        where: { donation_box_id: donationBoxId },
        relations: ['donation_box', 'collected_by', 'verified_by'],
        order: { collection_date: 'DESC' },
      });
    } catch (error) {
      throw new Error(
        `Failed to retrieve collections for box: ${error.message}`,
      );
    }
  }

  /**
   * Update a collection record
   */
  async update(
    id: number,
    updateDonationBoxDonationDto: UpdateDonationBoxDonationDto,
  )
  // : Promise<DonationBoxDonation> 
  {
    // try {
    //   const collection = await this.donationBoxDonationRepository.findOne({
    //     where: { id },
    //   });

    //   if (!collection) {
    //     throw new NotFoundException(
    //       `Collection record with ID ${id} not found`,
    //     );
    //   }

    //   // If donation_box_id is being changed, validate the new box exists
    //   if (
    //     updateDonationBoxDonationDto.donation_box_id &&
    //     updateDonationBoxDonationDto.donation_box_id !== collection.donation_box_id
    //   ) {
    //     const newBox = await this.donationBoxRepository.findOne({
    //       where: { id: updateDonationBoxDonationDto.donation_box_id },
    //     });

    //     if (!newBox) {
    //       throw new NotFoundException(
    //         `Donation box with ID ${updateDonationBoxDonationDto.donation_box_id} not found`,
    //       );
    //     }
    //   }

    //   // Update the entity
    //   await this.donationBoxDonationRepository.update(
    //     id,
    //     updateDonationBoxDonationDto,
    //   );

    //   // Return updated entity with relations
    //   return await this.donationBoxDonationRepository.findOne({
    //     where: { id },
    //     relations: ['donation_box', 'collected_by', 'verified_by'],
    //   });
    // } catch (error) {
    //   if (error instanceof NotFoundException) {
    //     throw error;
    //   }
    //   throw new Error(`Failed to update collection record: ${error.message}`);
    // }
  }

  /**
   * Soft delete a collection record (archive)
   */
  async remove(id: number) {
    try {
      const collection = await this.donationBoxDonationRepository.findOne({
        where: { id },
      });

      if (!collection) {
        throw new NotFoundException(
          `Collection record with ID ${id} not found`,
        );
      }

      // Soft delete by setting is_archived to true
      await this.donationBoxDonationRepository.update(id, {
        is_archived: true,
      });

      return { message: 'Collection record archived successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to archive collection record: ${error.message}`);
    }
  }

  /**
   * Update donation box statistics after collection
   */
  private async updateDonationBoxStats(
    boxId: number,
    amount: number,
    collectionDate: Date,
  ): Promise<void> {
    try {
      const box = await this.donationBoxRepository.findOne({
        where: { id: boxId },
      });

      if (box) {
        box.total_collected = Number(box.total_collected) + Number(amount);
        box.collection_count = box.collection_count + 1;
        box.last_collection_date = collectionDate;

        await this.donationBoxRepository.save(box);
      }
    } catch (error) {
      console.error('Failed to update donation box stats:', error);
      // Don't throw error - collection should still succeed even if stats update fails
    }
  }

  /**
   * Get collection statistics for a donation box
   */
  async getBoxCollectionStats(boxId: number) {
    try {
      const collections = await this.donationBoxDonationRepository.find({
        where: { donation_box_id: boxId, is_archived: false },
      });

      const totalCollected = collections.reduce(
        (sum, col) => sum + Number(col.collection_amount),
        0,
      );
      const collectionCount = collections.length;
      const lastCollection = collections.sort(
        (a, b) =>
          new Date(b.collection_date).getTime() -
          new Date(a.collection_date).getTime(),
      )[0];

      return {
        boxId,
        totalCollected,
        collectionCount,
        lastCollectionDate: lastCollection?.collection_date || null,
        collections,
      };
    } catch (error) {
      throw new Error(`Failed to get collection stats: ${error.message}`);
    }
  }
}
