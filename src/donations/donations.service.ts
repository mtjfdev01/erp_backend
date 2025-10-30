import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from './entities/donation.entity';
import { DonationInKind, DonationInKindCategory, DonationInKindCondition } from '../dms/donation_in_kind/entities/donation_in_kind.entity';
import { EmailService } from '../email/email.service';
import { PayfastService } from './payfast.service';
import { DonorService } from '../dms/donor/donor.service';
import { applyCommonFilters, FilterPayload, applyHybridFilters, HybridFilter, applyRelationsFilter, RelationsFilterConfig, applyRelationsSearch, normalizeRelationsFilters } from '../utils/filters/common-filter.util';
import axios from 'axios';
import { get } from 'http';
import { DonationMethod } from 'src/utils/enums';

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(Donation)
    private donationRepository: Repository<Donation>,
    @InjectRepository(DonationInKind)
    private donationInKindRepository: Repository<DonationInKind>,
    private emailService: EmailService,
    private payfastService: PayfastService,
    private donorService: DonorService,
  ) {}

  // Helper method to map category string to enum
  private mapCategoryToEnum(category: string): DonationInKindCategory {
    const categoryMap: { [key: string]: DonationInKindCategory } = {
      'clothing': DonationInKindCategory.CLOTHING,
      'food': DonationInKindCategory.FOOD,
      'medical': DonationInKindCategory.MEDICAL,
      'educational': DonationInKindCategory.EDUCATIONAL,
      'electronics': DonationInKindCategory.ELECTRONICS,
      'furniture': DonationInKindCategory.FURNITURE,
      'books': DonationInKindCategory.BOOKS,
      'toys': DonationInKindCategory.TOYS,
      'household': DonationInKindCategory.HOUSEHOLD,
      'other': DonationInKindCategory.OTHER,
    };
    return categoryMap[category.toLowerCase()] || DonationInKindCategory.OTHER;
  }

  // Helper method to map condition string to enum
  private mapConditionToEnum(condition: string): DonationInKindCondition {
    const conditionMap: { [key: string]: DonationInKindCondition } = {
      'new': DonationInKindCondition.NEW,
      'like_new': DonationInKindCondition.LIKE_NEW,
      'good': DonationInKindCondition.GOOD,
      'fair': DonationInKindCondition.FAIR,
      'poor': DonationInKindCondition.POOR,
    };
    return conditionMap[condition.toLowerCase()] || DonationInKindCondition.GOOD;
  }

  async create(createDonationDto: CreateDonationDto, user: any) {
    try {
     const meezan_url="https://acquiring.meezanbank.com/payment/rest/";
     const blinq_url="https://api.blinq.pk/";
     const manualDonationMethodOptions = ['cash','bank_transfer','credit_card','cheque','in_kind','online'];
     const onlineDonationMethodOptions = ['meezan','blinq','payfast'];
     
      
     // ============================================
     // AUTO-REGISTER DONOR IF NOT EXISTS & LINK TO DONATION
     // ============================================
     let donorId: number | null = createDonationDto.donor_id || null;
     let donor:any;
     
     if (Number(createDonationDto?.amount) < 50){
      //  return with error that donation amount is less than 50
      throw new HttpException('Donation amount is less than 50 PKR', 400);
     }
     if (createDonationDto.donor_email && createDonationDto.donor_phone || donorId) {
       console.log(`🔍 Checking if donor exists: ${createDonationDto.donor_email} / ${createDonationDto.donor_phone}`);
       
       // Check if donor already exists with this email AND phone
       if(createDonationDto.donor_email && createDonationDto.donor_phone){
        donor = await this.donorService.findByEmailAndPhone(
          createDonationDto.donor_email,
          createDonationDto.donor_phone
        );
       }
       else if(donorId){
        donor = await this.donorService.findOne(donorId);
       }
       
       if (donor) {
         console.log(`✅ Donor already exists: ${donor.email} (ID: ${donor.id})`);
         donorId = donor.id;
        //  return with error that donor is archived 
        if(donor?.is_archived === true){
          throw new HttpException('Donor is archived', 400);
        }
       } else {
         console.log(`❌ Donor not found. Auto-registering...`);
         
         // Auto-register the donor
         donor = await this.donorService.autoRegisterFromDonation({
           donor_name: createDonationDto.donor_name,
           donor_email: createDonationDto.donor_email,
           donor_phone: createDonationDto.donor_phone,
           city: createDonationDto.city,
           country: createDonationDto.country,
           address: createDonationDto.address,
         });
         
         if (donor) {
           console.log(`✅ Successfully auto-registered donor: ${donor.email} (ID: ${donor.id})`);
           donorId = donor.id;
         } else {
           console.warn(`⚠️ Failed to auto-register donor, but continuing with donation...`);
         }
       }
     } else {
       console.log(`⚠️ Skipping donor auto-registration: missing email or phone`);
     }
     // ============================================
     
     // Create donation with donor_id if available
     const donation = this.donationRepository.create({
       ...createDonationDto,
       donor_id: donorId, // ✅ Link donation to donor
       created_by: user?.id == -1 ? null : user?.id,
     });
     const savedDonation = await this.donationRepository.save(donation);
     
     console.log(`💾 Donation saved with donor_id: ${donorId || 'null'} (Donation ID: ${savedDonation.id})`);
      // console.log("createDonationDto*****************************");
      if(createDonationDto.donation_method && createDonationDto.donation_method === 'meezan') {

      // Determine which Meezan credentials to use based on donation type
      const isZakat = createDonationDto.donation_type === 'zakat';
      const meezanUser = isZakat ? process.env.MEEZAN_ZAKAT_USER : process.env.MEEZAN_USER;
      const meezanPass = isZakat ? process.env.MEEZAN_ZAKAT_PASS : process.env.MEEZAN_PASS;

      // Validate that required credentials are present
      if (!meezanUser || !meezanPass) {
        const credentialType = isZakat ? 'Zakat' : 'Sadqa';
        throw new HttpException(
          `${credentialType} Meezan credentials not configured. Please check environment variables.`,
          500
        );
      }

      const reqParams = new URLSearchParams({
        userName: meezanUser,
        password: meezanPass,
        orderNumber: savedDonation.id.toString(),
        amount: (savedDonation.amount * 100).toString(), // amount in minor units (PKR -> paisa)
        currency: '586',
        returnUrl: `${process.env.BASE_Frontend_URL}/thanks?donation_id=${savedDonation.id}`,
      });

      // Step 3: Call Meezan register.do
      const response = await axios.post(
        `${process.env.MEEZAN_URL}/register.do`,
        reqParams,
      );
      const data = response.data;

      // Step 4: Handle response
      if (!data.orderId || !data.formUrl) {
        throw new HttpException(
          data.errorMessage || 'Meezan API error during order registration',
          400,
        );
      }

      // Step 5: Update donation with Meezan orderId
      savedDonation.orderId = data.orderId;
      savedDonation.status = 'registered';
      await this.donationRepository.save(savedDonation);

      // Step 6: Send confirmation email to donor
      // if (savedDonation.donor_email) {
      //   await this.emailService.sendDonationConfirmation({
      //     donorName: savedDonation.donor_name || 'Valued Donor',
      //     donorEmail: savedDonation.donor_email,
      //     amount: savedDonation.amount,
      //     currency: savedDonation.currency || 'PKR',
      //     paymentUrl: data.formUrl,
      //     donationMethod: 'meezan',
      //     donationType: savedDonation.donation_type || 'sadqa',
      //     orderId: data.orderId,
      //   });
      // }
      
      // Step 7: Return donation and redirect URL
      return {
        paymentUrl: data.formUrl,
      };
    }
    else if(createDonationDto.donation_method && createDonationDto.donation_method === 'blinq') {
      //  get auth from blinq 
      let authPayload = { 
        ClientID: process.env.BLINQ_ID.toString(), 
        ClientSecret:process.env.BLINQ_PASS.toString(),
        }
        console.log("authPayload", authPayload);
      const authResponse = await axios.post(
        `${blinq_url}api/Auth`,
        authPayload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      // console.log("blinq auth resp", authResponse)
      const authToken = await authResponse?.headers?.token;
      // console.log("authToken", authResponse?.headers);
      if(authToken) {
        console.log("Blinq Token is valid")
      // Calculate dates
      const currentDate = new Date();
      const dueDate = new Date(currentDate.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days later
      const validityDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate()); // 1 year later

      // Format dates to YYYY-MM-DD
      const formatDate = (date) => date.toISOString().split('T')[0];

      const invoicePayload = [{
        "InvoiceNumber": savedDonation.id.toString(),
        "InvoiceAmount": savedDonation.amount.toString(),
        "InvoiceDueDate": formatDate(dueDate),
        "ValidityDate": formatDate(validityDate),
        "InvoiceType": "Service",
        "IssueDate": formatDate(currentDate),
        "CustomerName": donor?.name || null,
        
      }]

        //  create invoice on blinq
        const blinqInvoice = await axios.post(
          `${blinq_url}invoice/create`,
          invoicePayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'token': authToken
            }
          }
        );

        console.log("blinqInvoice_____", blinqInvoice?.data);

        // check invoice status ****************************
        // const invoiceStatusData = await axios.get(
        //   `${blinq_url}invoice/getstatus?PaymentCode=${blinqInvoice?.data?.ResponseDetail[0]?.PaymentCode}`,
        //   {
        //     headers: {
        //       'Content-Type': 'application/json',
        //       'token': authToken
        //     }
        //   }
        // );
        // const invoiceStatus = invoiceStatusData?.data?.ResponseDetail[0]?.InvoiceStatus;
        // console.log("invoiceStatus_____", invoiceStatus);



         // get All Paid  ***********************************************
        //  This API allows you to get paid invoices details by providing startDate and endDate as URL parameter 
        //  and secure token in request header. 
  
        // URL: https://{BaseURL}/invoice/getpaidinvoices?startDate={startDate}&endDate={endDate} 
        // // Method: GET
        // Request Parameters(URL) 
 
        // Parameter Mandatory/Optional Data Type 
        // startDate M String(yyyy-MM-dd) 
        // endDate M String(yyyy-MM-dd) 

        //       const formatDate = (date) => date.toISOString().split('T')[0];
        // const startDate = formatDate(currentDate);
        // const endDate = formatDate(dueDate);
        // const paidInvoicesData = await axios.get(
        //   `${blinq_url}invoice/getpaidinvoices?startDate=${startDate}&endDate=${endDate}`,
        //   {
        //     headers: {
        //       'Content-Type': 'application/json',
        //       'token': authToken
        //     }
        //   }
        // );
        // const paidInvoices = paidInvoicesData?.data?.ResponseDetail;
        // console.log("paidInvoices_____", paidInvoices);



          savedDonation.status = 'registered';
          savedDonation.orderId = blinqInvoice?.data?.ResponseDetail[0]?.PaymentCode;
          await this.donationRepository.save(savedDonation);

          // Send confirmation email to donor
          // if (savedDonation.donor_email) {
          //   await this.emailService.sendDonationConfirmation({
          //     donorName: savedDonation.donor_name || 'Valued Donor',
          //     donorEmail: savedDonation.donor_email,
          //     amount: savedDonation.amount,
          //     currency: savedDonation.currency || 'PKR',
          //     paymentUrl: blinqInvoice?.data?.ResponseDetail[0]?.ClickToPayUrl,
          //     donationMethod: 'blinq',
          //     orderId: blinqInvoice?.data?.ResponseDetail[0]['1BillID'],
          //   });
          // }

          return {
            paymentUrl: blinqInvoice?.data?.ResponseDetail[0]?.ClickToPayUrl,
          };        
        // }

      }
      else {
        console.log("Blinq Token is not valid")
        throw new HttpException('Blinq Token is not valid', 400);
      }
    }
    else if(createDonationDto.donation_method && createDonationDto.donation_method === 'payfast') {
      // Get complete response from Payfast
      const payfastResponse = await this.payfastService.getAccessToken(
        savedDonation.id.toString(),
        savedDonation.amount
      );

      // console.log("payfastResponse_____", payfastResponse);
      
      // // Send confirmation email to donor
      // if (savedDonation.donor_email) {
      //   await this.emailService.sendDonationConfirmation({
      //     donorName: savedDonation.donor_name || 'Valued Donor',
      //     donorEmail: savedDonation.donor_email,
      //     amount: savedDonation.amount,
      //     currency: savedDonation.currency || 'PKR',
      //     paymentUrl: payfastResponse?.paymentUrl || payfastResponse?.url,
      //     donationMethod: 'payfast',
      //     donationType: savedDonation.donation_type || 'sadqa',
      //     orderId: payfastResponse?.basketId || savedDonation.id.toString(),
      //   });
      // }
      // Return complete Payfast response
      return {...payfastResponse, 
        BASKET_ID: savedDonation.id.toString(),
        TXNAMT: savedDonation.amount.toString(),
      };
    }
    else if(manualDonationMethodOptions.includes(createDonationDto.donation_method))  {
      // here we need to create a manual donation
      console.log("Created manually");
      if(createDonationDto.donation_method === 'in_kind') {
        // Create the main donation record first
        const donation = this.donationRepository.create(createDonationDto);
        const savedDonation = await this.donationRepository.save(donation);
        
        // Create DonationInKind records for each item in the array
        if (createDonationDto.in_kind_items && createDonationDto.in_kind_items.length > 0) {
          const donationInKindRecords = [];
          
          for (const item of createDonationDto.in_kind_items) {
            const donationInKind = this.donationInKindRepository.create({
              donation_id: savedDonation.id.toString(),
              item_name: item.name,
              item_id: item.item_code || null,
              description: item.description || null,
              category: item.category ? this.mapCategoryToEnum(item.category) : DonationInKindCategory.OTHER,
              condition: item.condition ? this.mapConditionToEnum(item.condition) : DonationInKindCondition.GOOD,
              quantity: item.quantity,
              estimated_value: item.estimated_value || null,
              brand: item.brand || null,
              model: item.model || null,
              size: item.size || null,
              color: item.color || null,
              collection_date: new Date(item.collection_date),
              collection_location: item.collection_location || null,
              notes: item.notes || null,
            });
            
            donationInKindRecords.push(donationInKind);
          }
          
          // Save all DonationInKind records
          await this.donationInKindRepository.save(donationInKindRecords);
        }
        
        return savedDonation;
      }
    }
    else {
      throw new HttpException('Invalid donation method', 400);
    }
    } catch (error) {
      console.log(error?.message)
      throw new Error(`Failed to create donation: ${error.message}`);
    }
  }

  async findAll(
    page = 1,
    pageSize = 10,
    sortField = 'created_at',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    filters: FilterPayload = {},
    hybridFilters: HybridFilter[] = [],
    relationsFilters?: Record<string, Record<string, any>>
  ) {
    try {
      const entitySearchFields = ['city'];
      
      const query = this.donationRepository.createQueryBuilder('donation')
      .leftJoin('donation.donor', 'donor')
      .addSelect('donor.name', 'donor_name')
      .addSelect('donor.email', 'donor_email')
      .addSelect('donor.id', 'donor_id')
      .addSelect('donor.phone', 'donor_phone')
      ;
      // Apply filters
      // 1) Main entity search/equality/date/range
      applyCommonFilters(query, filters, entitySearchFields, 'donation');
      // applyHybridFilters(query, hybridFilters, 'donation');

      // 2) Relation search (const config) using top-level search
      const RELATIONS_SEARCH: RelationsFilterConfig = { donor: ['name', 'email', 'phone'] };
      applyRelationsSearch(query, filters.search as any, RELATIONS_SEARCH, 'donation');

      // 2b) Per-relation search terms via relationsFilters.{alias}.search
      if (relationsFilters) {
        Object.entries(relationsFilters).forEach(([alias, cols]) => {
          const term = (cols as any)?.search;
          if (term && typeof term === 'string') {
            const singleAliasCfg: RelationsFilterConfig = { [alias]: RELATIONS_SEARCH[alias] || [] } as any;
            applyRelationsSearch(query, term, singleAliasCfg, 'donation');
          }
        });
      }

      // 3) Relation equality: normalize nested relationsFilters -> namespaced keys and apply
      const RELATIONS_EQ: RelationsFilterConfig = { donor: ['name', 'email', 'phone'] };
      const normalizedRelationFilters = normalizeRelationsFilters(relationsFilters, RELATIONS_EQ);
      applyRelationsFilter(query, normalizedRelationFilters, RELATIONS_EQ, 'donation');
      // Pagination
      const skip = (page - 1) * pageSize;
      query.skip(skip).take(pageSize);

      // Sorting
      query.orderBy(`donation.${sortField}`, sortOrder);

      // Get paginated data + total count
      const [data, total] = await query.getManyAndCount();
      const totalPages = Math.ceil(total / pageSize);

      // ✅ Get SUM(amount) with same filters
      const sumQuery = this.donationRepository.createQueryBuilder('donation')
        .select('SUM(donation.amount)', 'totalDonationAmount')
        .leftJoin('donation.donor', 'donor');

      // Apply same filters to keep consistent
      applyCommonFilters(sumQuery, filters, entitySearchFields, 'donation');
      // applyHybridFilters(sumQuery, hybridFilters, 'donation');
      applyRelationsSearch(sumQuery, filters.search as any, RELATIONS_SEARCH, 'donation');
      if (relationsFilters) {
        Object.entries(relationsFilters).forEach(([alias, cols]) => {
          const term = (cols as any)?.search;
          if (term && typeof term === 'string') {
            const singleAliasCfg: RelationsFilterConfig = { [alias]: RELATIONS_SEARCH[alias] || [] } as any;
            applyRelationsSearch(sumQuery, term, singleAliasCfg, 'donation');
          }
        });
      }
      applyRelationsFilter(sumQuery, normalizedRelationFilters, RELATIONS_EQ, 'donation');

      const sumResult = await sumQuery.getRawOne();
      const totalDonationAmount = Number(sumResult.totalDonationAmount) || 0;

      console.log("totalDonationAmount", totalDonationAmount);

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
        totalDonationAmount, // 👈 extra key added here
      };
    } catch (error) {
      throw new Error(`Failed to retrieve donations: ${error.message}`);
    }
  }

  async findOne(id: number) {
    try {
      // Use createQueryBuilder to join with donor table
      const donation = await this.donationRepository
        .createQueryBuilder('donation')
        .leftJoinAndSelect('donation.donor', 'donor')
        .where('donation.id = :id', { id })
        .getOne();
      
      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }
      
      // if donation.donation_method is in_kind then get its all in kind items
      if(donation.donation_method === 'in_kind') {
        const inKindItems = await this.findInKindByDonationId(id);
        return {
          ...donation,
          in_kind_items: inKindItems,
        };
      }
      return donation;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve donation: ${error.message}`);
    }
  }

  // Get all in-kind items for a specific donation
  async getInKindItems(donationId: number) {
    try {
      return await this.donationInKindRepository.find({
        where: { donation_id: donationId.toString() },
        order: { created_at: 'DESC' },
      });
    } catch (error) {
      throw new Error(`Failed to retrieve in-kind items: ${error.message}`);
    }
  }

  // Get all donation in kind records for a specific donation
  async findInKindByDonationId(donationId: number) {
    try {
      return await this.donationInKindRepository.find({
        where: { donation_id: donationId.toString() },
        order: { created_at: 'DESC' },
      });
    } catch (error) {
      throw new Error(`Failed to retrieve donation in kind records: ${error.message}`);
    }
  }

  async update(id: number, updateDonationDto: UpdateDonationDto) {
    try {
      const donation = await this.donationRepository.findOne({ where: { id } });
      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }
      
      await this.donationRepository.update(id, updateDonationDto);
      return await this.donationRepository.findOne({ where: { id } });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update donation: ${error.message}`);
    }
  }

  async remove(id: number) {
    try {
      const donation = await this.donationRepository.findOne({ where: { id } });
      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }
      
      await this.donationRepository.delete(id);
      return { message: 'Donation deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to delete donation: ${error.message}`);
    }
  }

  async updateDonationStatus(payload: any) {
    try {
      console.log("Updating donation status with payload:", payload);
      
      let donationId: string;
      let paymentMethod: string;
      
      // Determine payment method and extract donation ID
      if (payload.transaction_id && payload.err_code !== undefined && payload.basket_id) {
        // Payfast payload format
        paymentMethod = 'payfast';
        donationId = payload.basket_id;
        console.log("Processing Payfast status update");
      } else if (payload.payment_method && (payload.payment_method === 'meezan' || payload.payment_method === 'blinq')) {
        
        // Meezan or Blinq payload format
        paymentMethod = payload.payment_method;
        donationId = payload.donation_id || payload.orderId || payload.order_id;
        console.log(`Processing ${paymentMethod} status update`);
      } else {
        throw new Error('Invalid payload format: Unable to determine payment method or donation ID');
      }

      if (!donationId) {
        throw new Error('Donation ID not found in payload');
      }

      // Find the donation by ID
      const donation = await this.donationRepository.findOne({ 
        where: { id: parseInt(donationId) } 
      });

      if (!donation) {
        throw new NotFoundException(`Donation with ID ${donationId} not found`);
      }

      // Update donation status based on payment method
      let newStatus: string;
      let updateData: any = {};

      if (paymentMethod === 'payfast') {
        // Payfast status logic
        if (payload.err_code === '00' || payload.err_code === 0) {
          newStatus = 'completed';
        } else {
          newStatus = 'failed';
        }
        
        updateData = {
          status: newStatus,
          transaction_id: payload.transaction_id,
          error_code: payload.err_code,
          error_message: payload.err_msg,
        };
        
      } else if (paymentMethod === 'meezan') {
        // Meezan status logic
        if (payload.status === 'completed' || payload.status === 'success') {
          newStatus = 'completed';
        } else {
          newStatus = 'failed';
        }
        
        updateData = {
          status: newStatus,
          transaction_id: payload.transaction_id,
          error_code: payload.error_code,
          error_message: payload.error_message,
        };
        
      } else if (paymentMethod === 'blinq') {
        // Blinq status logic
        if (payload.status === 'completed' || payload.status === 'success') {
          newStatus = 'completed';
        } else {
          newStatus = 'failed';
        }
        
        updateData = {
          status: newStatus,
          transaction_id: payload.transaction_id,
          error_code: payload.error_code,
          error_message: payload.error_message,
        };
      }

      // Update the donation
      await this.donationRepository.update(parseInt(donationId), updateData);

      // Get updated donation
      const updatedDonation = await this.donationRepository.findOne({ 
        where: { id: parseInt(donationId) } 
      });

      console.log(`Donation ${donationId} status updated to: ${newStatus}`);
      
      return {
        donationId: parseInt(donationId),
        paymentMethod,
        newStatus,
        // updatedDonation,
      };
      
    } catch (error) {
      console.error("Error in updateDonationStatus:", error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update donation status: ${error.message}`);
    }
  }

  // PayFast IPN Handler - Public endpoint logic
  async handlePayfastIpn(payload: any) {
    try {
      console.log("=== PAYFAST IPN RECEIVED ===");
      console.log("Full IPN Payload:", JSON.stringify(payload, null, 2));
      console.log("Timestamp:", new Date().toISOString());
      
      // Extract key parameters from PayFast IPN
      const {
        basket_id,
        err_code,
        validation_hash,
        transaction_id,
        order_date,
        PaymentName,
        transaction_amount,
        merchant_amount,
        err_msg,
        transaction_currency,
        mobile_no,
        masked_pan
      } = payload;

      console.log("=== EXTRACTED PARAMETERS ===");
      console.log("Basket ID:", basket_id);
      console.log("Error Code:", err_code);
      console.log("Error Message:", err_msg);
      console.log("Validation Hash:", validation_hash);
      console.log("Transaction ID:", transaction_id);
      console.log("Order Date:", order_date);
      console.log("Payment Name:", PaymentName);
      console.log("Transaction Amount:", transaction_amount);
      console.log("Merchant Amount:", merchant_amount);

      // Validate required parameters
      if (!basket_id || !err_code || !validation_hash) {
        throw new Error('Missing required PayFast parameters');
      }

      // Find donation by basket_id (which is the donation id)
      const donation = await this.donationRepository.findOne({ 
        where: { id: parseInt(basket_id) } 
      });

      if (!donation) {
        throw new Error(`Donation with ID ${basket_id} not found`);
      }

      console.log("Found donation:", { id: donation.id, amount: donation.amount, status: donation.status });

      // Verify PayFast hash
      const hashValid = this.verifyPayfastHash(basket_id, err_code, validation_hash);
      console.log("Hash verification result:", hashValid);

      if (!hashValid) {
        throw new Error('Invalid PayFast validation hash');
      }

      // Update donation status based on err_code
      let newStatus: string;
      if (err_code === '000' || err_code === '00') {
        newStatus = 'completed';
        console.log("Donation marked as completed");
        
        // Send success email
        await this.emailService.sendDonationSuccessNotification(donation, {
          transaction_id,
          transaction_amount,
          order_date,
          PaymentName
        });
        
        // here call recurring utility 
      } else {
        newStatus = 'failed';
        console.log("Donation marked as failed");
        
        // Send failure email
        await this.emailService.sendDonationFailureNotification(donation, {
          err_code,
          err_msg,
          transaction_id
        });
      }

      // Update donation
      await this.donationRepository.update(parseInt(basket_id), {
        orderId: transaction_id,
        status: newStatus,
        err_msg
      });

      console.log(`Donation ${basket_id} updated successfully with status: ${newStatus}`);
      console.log("=== IPN PROCESSING COMPLETE ===");
      
      return {
        basket_id: basket_id,
        err_code: err_code,
        transaction_id: transaction_id,
        status: newStatus,
        processed: true
      };
      
    } catch (error) {
      console.error("=== IPN PROCESSING ERROR ===");
      console.error("Error:", error.message);
      console.error("Stack:", error.stack);
      
      throw error;
    }
  }

  // Verify PayFast validation hash
  private verifyPayfastHash(basket_id: string, err_code: string, received_hash: string): boolean {
    try {
      const crypto = require('crypto');
      
      // Get PayFast credentials from environment
      const merchant_secret_key = process.env.PF_SECURED_KEY; 
      const merchant_id = process.env.PF_MERCHANT_ID;
      
      if (!merchant_secret_key || !merchant_id) {
        console.error('PayFast credentials not configured');
        return false;
      }

      // Create hash string: basket_id|merchant_secret_key|merchant_id|err_code
      const hashString = `${basket_id}|${merchant_secret_key}|${merchant_id}|${err_code}`;
      console.log("Hash string:", hashString);
      
      // Calculate SHA256 hash
      const calculatedHash = crypto.createHash('sha256').update(hashString).digest('hex');
      console.log("Calculated hash:", calculatedHash);
      console.log("Received hash:", received_hash);
      
      // Compare hashes (case insensitive)
      return calculatedHash.toLowerCase() === received_hash.toLowerCase();
      
    } catch (error) {
      console.error("Hash verification error:", error.message);
      return false;
    }
  }

  // Public endpoint to update donation status
  async updateDonationFromPublic(id: string, order_id: string) {
    try {
      console.log(`Updating donation ID: ${id} with order_id: ${order_id}`);
      
      // Find donation by ID here add check if that donation is not completed already if completed then return success and not update the donation  
      const donation = await this.donationRepository.findOne({ 
        where: { id: Number(id) } 
      });

      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }

      if (donation.status == 'completed') {
        return {
          id: parseInt(id),
          order_id: order_id,
          status: 'completed',
          updated: true
        };
      }

        // Update only orderId and status
      await this.donationRepository.update(parseInt(id), {
        orderId: order_id,
        status: 'completed'
      });

      console.log(`Donation ${id} updated successfully with order_id: ${order_id}`);
      
      return {
        id: parseInt(id),
        order_id: order_id,
        status: 'completed',
        updated: true
      };
      
    } catch (error) {
      console.error("Error updating donation from public:", error.message);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update donation: ${error.message}`);
    }
  }


  // Blinq IPN Handler - Public endpoint logic
  async handleBlinqCallback(payload: any) {
    try {
      console.log("=== BLINQ CALLBACK RECEIVED ===");
      console.log("Full Callback Payload:", JSON.stringify(payload, null, 2));
      console.log("Timestamp:", new Date().toISOString());
      
      // Extract key parameters from Blinq callback
      const {
        data_integrity,
        paid_on,
        invoice_number,
        invoice_status,
        payment_code,
        payment_id,
        ref_number,
        paid_bank,
        amount,
        amount_paid,
        net_amount,
        txnFee,
        paid_via
      } = payload;

      console.log("=== EXTRACTED PARAMETERS ===");
      console.log("Invoice Number:", invoice_number);
      console.log("Invoice Status:", invoice_status);
      console.log("Payment Code:", payment_code);
      console.log("Amount:", amount);
      console.log("Amount Paid:", amount_paid);
      console.log("Paid Via:", paid_via);
      console.log("Paid On:", paid_on);

      // Validate required parameters
      if (!invoice_number || !invoice_status || !data_integrity) {
        return {
          code: "01",
          message: "Missing required parameters",
          status: "failure",
          invoice_number: invoice_number || "unknown"
        };
      }

      // Verify Blinq hash
      const hashValid = this.verifyBlinqHash(invoice_number, data_integrity);
      console.log("Hash verification result:", hashValid);

      if (!hashValid) {
        return {
          code: "01",
          message: "Invalid data integrity validation",
          status: "failure",
          invoice_number: invoice_number
        };
      }

      // Find donation by invoice_number (which should match our donation ID)
      const donation = await this.donationRepository.findOne({ 
        where: { id: parseInt(invoice_number) } 
      });

      if (!donation) {
        return {
          code: "03",
          message: "Invoice not found",
          status: "failure",
          invoice_number: invoice_number
        };
      }

      // Check if already paid
      if (donation.status === 'completed') {
        return {
          code: "02",
          message: "Invoice already paid",
          status: "success",
          invoice_number: invoice_number
        };
      }

      console.log("Found donation:", { id: donation.id, amount: donation.amount, status: donation.status });

      // Update donation status
      await this.donationRepository.update(parseInt(invoice_number), {
        orderId: payment_code,
        status: 'completed',
        err_msg: `Paid via ${paid_via} - Bank: ${paid_bank}`
      });

      // Send success email
      await this.emailService.sendDonationSuccessNotification(donation, {
        transaction_id: payment_code,
        transaction_amount: amount_paid,
        order_date: paid_on,
        PaymentName: paid_via
      });

      console.log(`Donation ${invoice_number} updated successfully with status: completed`);
      console.log("=== BLINQ CALLBACK PROCESSING COMPLETE ===");
      
      return {
        code: "00",
        message: "Invoice successfully marked as paid",
        status: "success",
        invoice_number: invoice_number
      };
      
    } catch (error) {
      console.error("=== BLINQ CALLBACK PROCESSING ERROR ===");
      console.error("Error:", error.message);
      console.error("Stack:", error.stack);
      
      return {
        code: "01",
        message: "Internal server error",
        status: "failure",
        invoice_number: payload.invoice_number || "unknown"
      };
    }
  }

  // Verify Blinq data integrity hash
  private verifyBlinqHash(invoice_number: string, received_hash: string): boolean { 
    try {
      const crypto = require('crypto');
      
      // Get Blinq callback secret from environment
      const callback_secret = process.env.BLINQ_CALLBACK_SECRET || process.env.BLINQ_PASS;
      
      if (!callback_secret) {
        console.error('Blinq callback secret not configured');
        return false;
      }

      // Step 1: Concatenate invoice_number + callback_secret
      const concatenatedString = `${invoice_number}${callback_secret}`;
      console.log("Concatenated string:", concatenatedString);
      
      // Step 2: Generate SHA-256 hash
      const sha256Hash = crypto.createHash('sha256').update(concatenatedString).digest('hex');
      console.log("SHA-256 hash:", sha256Hash);
      
      // Step 3: Convert SHA-256 result to MD5 hash
      const md5Hash = crypto.createHash('md5').update(sha256Hash).digest('hex');
      console.log("MD5 hash:", md5Hash);
      console.log("Received hash:", received_hash);
      
      // Step 4: Compare hashes (case insensitive)
      return md5Hash.toLowerCase() === received_hash.toLowerCase();
      
    } catch (error) {
      console.error("Blinq hash verification error:", error.message);
      return false;
    }
  }

  // 
}