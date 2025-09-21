import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from './entities/donation.entity';
import { EmailService } from '../email/email.service';
import { PayfastService } from './payfast.service';
import axios from 'axios';

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(Donation)
    private donationRepository: Repository<Donation>,
    private emailService: EmailService,
    private payfastService: PayfastService,
  ) {}

  async create(createDonationDto: CreateDonationDto) {
    try {
     const meezan_url="https://acquiring.meezanbank.com/payment/rest/";
     const blinq_url="https://api.blinq.pk/";
     const donation = this.donationRepository.create(createDonationDto);
     const savedDonation = await this.donationRepository.save(donation);

      console.log("createDonationDto*****************************");
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
        description: savedDonation.item_name || (isZakat ? 'Zakat Donation' : 'Sadqa Donation'),
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
        "CustomerName": savedDonation.donor_name,
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

          savedDonation.status = 'registered';
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

      console.log("payfastResponse_____", payfastResponse);
      // Return complete Payfast response
      return {...payfastResponse, 
        BASKET_ID: savedDonation.id.toString(),
        TXNAMT: savedDonation.amount.toString(),
      };
    }
    else {
      throw new HttpException('Invalid donation method', 400);
    }
    } catch (error) {
      console.log(error?.message)
      throw new Error(`Failed to create donation: ${error.message}`);
    }
  }

  async findAll() {
    try {
      return await this.donationRepository.find();
    } catch (error) {
      throw new Error(`Failed to retrieve donations: ${error.message}`);
    }
  }

  async findOne(id: number) {
    try {
      const donation = await this.donationRepository.findOne({ where: { id } });
      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }
      return donation;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve donation: ${error.message}`);
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
}



