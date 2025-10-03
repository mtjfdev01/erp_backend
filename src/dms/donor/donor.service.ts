import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donor, DonorType } from './entities/donor.entity';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
import { applyCommonFilters, FilterPayload } from '../../utils/filters/common-filter.util';
import * as bcrypt from 'bcrypt';

interface PaginationOptions {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
  donor_type?: string;
  city?: string;
  country?: string;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class DonorService {
  constructor(
    @InjectRepository(Donor)
    private readonly donorRepository: Repository<Donor>,
  ) {}

  /**
   * Create a new donor (individual or CSR)
   */
  async register(createDonorDto: CreateDonorDto): Promise<Donor> {
    try {
      // Check if email already exists
      const existingDonor = await this.donorRepository.findOne({
        where: { email: createDonorDto.email },
      });

      if (existingDonor) {
        throw new ConflictException('Email already exists');
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(createDonorDto.password, 10);

      // Create donor entity
      const donor = this.donorRepository.create({
        ...createDonorDto,
        password: hashedPassword,
      });

      // Save and return
      const savedDonor = await this.donorRepository.save(donor);
      
      // Remove password from response
      delete savedDonor.password;
      
      return savedDonor;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ConflictException(`Failed to create donor: ${error.message}`);
    }
  }

  /**
   * Find all donors with pagination and filtering
   */
  async findAll(options: PaginationOptions) {
    try {
      const {
        page = 1,
        pageSize = 10,
        sortField = 'created_at',
        sortOrder = 'DESC',
        search = '',
        donor_type = '',
        city = '',
        country = '',
        is_active,
        start_date,
        end_date,
      } = options;

      const skip = (page - 1) * pageSize;

      // Define searchable fields based on donor type
      const searchFields = [
        'name',
        'first_name',
        'last_name',
        'email',
        'phone',
        'company_name',
        'contact_person',
        'city',
        'country',
      ];

      // Create base query
      const queryBuilder = this.donorRepository.createQueryBuilder('donor');

      // Apply common filters using our utility
      const filters: FilterPayload = {
        search,
        donor_type,
        city,
        country,
        start_date,
        end_date,
      };

      applyCommonFilters(queryBuilder, filters, searchFields, 'donor');

      // Apply is_active filter
      if (is_active !== undefined) {
        queryBuilder.andWhere('donor.is_active = :is_active', { is_active });
      }

      // Apply sorting
      const validSortFields = [
        'name',
        'company_name',
        'email',
        'city',
        'country',
        'donor_type',
        'created_at',
        'total_donated',
        'donation_count',
        'last_donation_date',
      ];
      const sortFieldName = validSortFields.includes(sortField) ? sortField : 'created_at';
      queryBuilder.orderBy(`donor.${sortFieldName}`, sortOrder);

      // Apply pagination
      queryBuilder.skip(skip).take(pageSize);

      // Execute query
      const [data, total] = await queryBuilder.getManyAndCount();

      // Remove passwords from response
      data.forEach(donor => delete donor.password);

      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNext: page < Math.ceil(total / pageSize),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new NotFoundException(`Failed to retrieve donors: ${error.message}`);
    }
  }

  /**
   * Find one donor by ID
   */
  async findOne(id: number): Promise<Donor> {
    try {
      const donor = await this.donorRepository.findOne({ where: { id } });
      
      if (!donor) {
        throw new NotFoundException(`Donor with ID ${id} not found`);
      }

      // Remove password from response
      delete donor.password;
      
      return donor;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Failed to retrieve donor: ${error.message}`);
    }
  }

  /**
   * Find donor by email (for authentication)
   */
  async findByEmail(email: string): Promise<Donor | null> {
    return await this.donorRepository.findOne({ where: { email } });
  }

  /**
   * Validate donor credentials (for login)
   */
  async validateDonor(email: string, password: string): Promise<Donor> {
    const donor = await this.findByEmail(email);
    
    if (!donor) {
      throw new NotFoundException('Donor not found');
    }

    const isPasswordValid = await bcrypt.compare(password, donor.password);
    
    if (!isPasswordValid) {
      throw new NotFoundException('Invalid credentials');
    }

    // Remove password from response
    delete donor.password;
    
    return donor;
  }

  /**
   * Update donor information
   */
  async update(id: number, updateDonorDto: UpdateDonorDto): Promise<Donor> {
    try {
      const donor = await this.donorRepository.findOne({ where: { id } });
      
      if (!donor) {
        throw new NotFoundException(`Donor with ID ${id} not found`);
      }

      // // If password is being updated, hash it
      // if (updateDonorDto.password) {
      //   updateDonorDto.password = await bcrypt.hash(updateDonorDto.password, 10);
      // }

      // Update donor
      Object.assign(donor, updateDonorDto);
      const updatedDonor = await this.donorRepository.save(donor);

      // Remove password from response
      delete updatedDonor.password;
      
      return updatedDonor;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new ConflictException(`Failed to update donor: ${error.message}`);
    }
  }

  /**
   * Change donor password
   */
  async changePassword(
    donorId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    try {
      const donor = await this.donorRepository.findOne({ where: { id: donorId } });
      
      if (!donor) {
        throw new NotFoundException('Donor not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, donor.password);
      
      if (!isCurrentPasswordValid) {
        throw new ConflictException('Current password is incorrect');
      }

      // Validate new password strength
      const passwordValidation = this.validatePasswordStrength(newPassword);
      
      if (!passwordValidation.isValid) {
        throw new ConflictException(
          `Password requirements not met: ${passwordValidation.errors.join(', ')}`,
        );
      }

      // Hash and save new password
      donor.password = await bcrypt.hash(newPassword, 10);
      await this.donorRepository.save(donor);

      return { message: 'Password changed successfully' };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }
      throw new ConflictException('Failed to change password');
    }
  }

  /**
   * Soft delete (deactivate) donor
   */
  async remove(id: number): Promise<{ message: string }> {
    try {
      const donor = await this.donorRepository.findOne({ where: { id } });
      
      if (!donor) {
        throw new NotFoundException(`Donor with ID ${id} not found`);
      }

      // Soft delete - set is_active to false
      donor.is_active = false;
      await this.donorRepository.save(donor);

      return { message: 'Donor deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new ConflictException(`Failed to remove donor: ${error.message}`);
    }
  }

  /**
   * Update donation statistics
   */
  async updateDonationStats(
    donorId: number,
    amount: number,
  ): Promise<void> {
    try {
      const donor = await this.donorRepository.findOne({ where: { id: donorId } });
      
      if (donor) {
        donor.total_donated = Number(donor.total_donated) + amount;
        donor.donation_count += 1;
        donor.last_donation_date = new Date();
        await this.donorRepository.save(donor);
      }
    } catch (error) {
      console.error('Failed to update donation stats:', error);
    }
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Minimum 8 characters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('At least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('At least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('At least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('At least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
