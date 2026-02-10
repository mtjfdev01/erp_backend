import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from './entities/donation.entity';
import { DonationInKind, DonationInKindCategory, DonationInKindCondition } from '../dms/donation_in_kind/entities/donation_in_kind.entity';
import { User, Department, UserRole } from '../users/user.entity';
import { EmailService } from '../email/email.service';
import { PayfastService } from './payfast.service';
import { StripeService } from './stripe.service';
import { DonorService } from '../dms/donor/donor.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { applyCommonFilters, FilterPayload, applyHybridFilters, HybridFilter, applyRelationsFilter, RelationsFilterConfig, applyRelationsSearch, normalizeRelationsFilters, applyMultiselectFilters } from '../utils/filters/common-filter.util';
import { DateRangeUtil, DateRangeOptions, MONTH_NAMES_SHORT, DAY_NAMES_SHORT } from '../utils/summary/date-range.util';
import axios from 'axios';
import { get } from 'http';
import { DonationMethod } from 'src/utils/enums';
import * as crypto from 'crypto';
import { WhatsAppService } from 'src/utils/services/whatsapp.service';
import { Donor } from 'src/dms/donor/entities/donor.entity';
import { RecurringDonation } from 'src/dms/recurring_donations/entities/recurring_donation.entity';
import { CampaignsService } from '../dms/campaigns/campaigns.service';
import { DashboardAggregateService } from '../dashboard/dashboard-aggregate.service';

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(Donation)
    private donationRepository: Repository<Donation>,
    @InjectRepository(DonationInKind)
    private donationInKindRepository: Repository<DonationInKind>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
    private payfastService: PayfastService,
    private stripeService: StripeService,
    @InjectRepository(Donor)
    private donorRepository: Repository<Donor>,
    @InjectRepository(RecurringDonation)
    private recurringDonationRepository: Repository<RecurringDonation>,
    private donorService: DonorService,
    private notificationsService: NotificationsService,
    private whatsAppService: WhatsAppService,
    private campaignsService: CampaignsService,
    private dashboardAggregateService: DashboardAggregateService,
  ) {}

  // Get users who should receive donation notifications
  private async getDonationUsers(): Promise<number[]> {
    try {
      const userIds: number[] = [];

      // Always include user ID 5 (validate it exists first)
      const user5 = await this.userRepository.findOne({
        where: { id: 5, isActive: true, is_archived: false },
        select: ['id'],
      });
      if (user5) {
        userIds.push(5);
      }

      // Also get users from FUND_RAISING department or ADMIN role (including user ID 5 if they match)
      const additionalUsers = await this.userRepository
        .createQueryBuilder('user')
        .select('user.id', 'id')
        .where('user.isActive = :isActive', { isActive: true })
        .andWhere('user.is_archived = :is_archived', { is_archived: false })
        .orWhere({
          department: Department.FUND_RAISING,
        })
        .orWhere({
          id:5
        })
        .getRawMany();

      additionalUsers.forEach(user => {
        if (!userIds.includes(user.id)) {
          userIds.push(user.id);
        }
      });

      return userIds;
    } catch (error) {
      console.error('Error getting donation users:', error.message);
      // Return empty array if query fails (don't create notifications for invalid users)
      return [];
    }
  }

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

  /**
   * Create Meezan invoice - Reusable helper method
   * @param orderNumber - Order number (usually donation ID)
   * @param amount - Transaction amount (will be converted to paisa)
   * @param savedDonation - Optional donation entity to update (if not provided, uses dummy data)
   * @returns Promise with payment URL
   */
  async createMeezanInvoice(
    orderNumber: string | number,
    amount: number | string,
    savedDonation?: Donation,
  ): Promise<{
    paymentUrl: string;
    orderId: string;
  }> {
    try {
      const meezanUser = process.env.MEEZAN_USER;
      const meezanPass = process.env.MEEZAN_PASS;
      const meezanUrl = process.env.MEEZAN_URL || 'https://acquiring.meezanbank.com/payment/rest/';
      const baseFrontendUrl = process.env.BASE_Frontend_URL || '';

      // Validate that required credentials are present
      if (!meezanUser || !meezanPass) {
        throw new HttpException(
          'Meezan credentials not configured. Please check environment variables.',
          500,
        );
      }

      // Use dummy return URL if no donation provided
      const returnUrl = savedDonation
        ? `${baseFrontendUrl}/thanks?donation_id=${savedDonation.id}`
        : `${baseFrontendUrl}/thanks?donation_id=${orderNumber}`;

      const reqParams = new URLSearchParams({
        userName: meezanUser,
        password: meezanPass,
        orderNumber: orderNumber.toString(),
        amount: Math.round(Number(amount) * 100).toString(), // amount in minor units (PKR -> paisa), fixed precision
        currency: '586', // 586 = PKR (ISO 4217)
        returnUrl: returnUrl,
        // failUrl: returnUrl,
      });

      // Call Meezan register.do with timeout
      const response = await axios.post(
        `${meezanUrl}/register.do`,
        reqParams,
      );
      const data = response.data;

      // Handle response - check for errors first
      if (data.errorCode || data.error) {
        throw new HttpException(
          data.errorMessage || data.error || 'Meezan API error',
          400,
        );
      }
      
      if (!data.orderId || !data.formUrl) {
        console.error('Meezan API unexpected response:', data);
        throw new HttpException(
          'Meezan API returned invalid response',
          502,
        );
      }

      // Update donation if provided
      if (savedDonation) {
        savedDonation.orderId = data.orderId;
        savedDonation.status = 'registered';
        await this.donationRepository.save(savedDonation);
      }

      return {
        paymentUrl: data.formUrl,
        orderId: data.orderId,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to create Meezan invoice: ${error.message}`,
        500,
      );
    }
  }

  /**
   * Get Meezan order status extended - Verify payment status with Meezan API
   * @param orderId - Meezan orderId (mdOrder) from registration
   * @returns Promise with order status details
   */
  async getMeezanOrderStatusExtended(orderId: string): Promise<any> {
    try {
      const meezanUser = process.env.MEEZAN_USER;
      const meezanPass = process.env.MEEZAN_PASS;
      const meezanUrl = process.env.MEEZAN_URL || 'https://acquiring.meezanbank.com/payment/rest/';

      if (!meezanUser || !meezanPass) {
        throw new HttpException(
          'Meezan credentials not configured. Please check environment variables.',
          500,
        );
      }

      const reqParams = new URLSearchParams({
        userName: meezanUser,
        password: meezanPass,
        orderId: orderId,
      });

      const response = await axios.post(
        `${meezanUrl}/getOrderStatusExtended.do`,
        reqParams,
        { timeout: 30000 },
      );

      const data = response.data;

      if (data.errorCode || data.error) {
        throw new HttpException(
          data.errorMessage || data.error || 'Meezan API error',
          400,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error.response) {
        throw new HttpException(
          `Meezan API error: ${error.response.data?.errorMessage || error.message}`,
          error.response.status || 502,
        );
      }
      if (error.request) {
        throw new HttpException('Meezan API timeout or network error', 503);
      }
      throw new HttpException(`Failed to get Meezan order status: ${error.message}`, 500);
    }
  }

  /**
   * Map Meezan orderStatus to donation status
   * @param orderStatus - Meezan orderStatus code
   * @returns Donation status string
   */
  private mapMeezanStatusToDonationStatus(orderStatus: number): string {
    // Meezan orderStatus mapping:
    // 0 → Registered, not paid → pending
    // 1 → Approved / Hold (two-phase preauth) → pending
    // 2 → Deposited (paid) → completed
    // 3 → Reversed → cancelled
    // 4 → Refunded → refunded
    // 6 → Declined → failed
    switch (orderStatus) {
      case 2:
        return 'completed';
      case 3:
        return 'cancelled';
      case 4:
        return 'refunded';
      case 6:
        return 'failed';
      case 0:
      case 1:
      default:
        return 'pending';
    }
  }

  /**
   * Get PayFast transaction status - Verify payment status with PayFast API
   * Supports lookup by basket_id (donation ID) or transaction_id
   * @param basketId - Basket ID (donation ID) used during payment
   * @param transactionId - Optional PayFast transaction ID for direct lookup
   * @param orderDate - Optional order date string (for basket_id lookup)
   * @returns Promise with PayFast transaction status details
   */
  async getPayfastOrderStatus(
    basketId: string,
    transactionId?: string,
    orderDate?: string,
  ): Promise<any> {
    try {
      const payfastBaseUrl = process.env.PF_BASE_URL || 'https://ipg1.apps.net.pk/Ecommerce/api/Transaction';
      const merchantId = process.env.PF_MERCHANT_ID;
      const securedKey = process.env.PF_SECURED_KEY;

      if (!merchantId || !securedKey) {
        throw new HttpException(
          'PayFast credentials not configured. Please check environment variables.',
          500,
        );
      }

      // Step 1: Get a fresh access token for Bearer authorization
      const tokenResponse = await this.payfastService.getAccessToken(
        basketId,
        '0', // amount is not relevant for status check, but required by getAccessToken
      );

      const accessToken = tokenResponse?.ACCESS_TOKEN;
      if (!accessToken) {
        console.error('PayFast token response structure:', tokenResponse);
        throw new HttpException('Failed to obtain PayFast access token for status check', 401);
      }

      // Step 2: Call the appropriate status endpoint
      let response;

      if (transactionId) {
        // Lookup by transaction ID: GET /transaction/<transaction_id>
        response = await axios.get(
          `${payfastBaseUrl}/${transactionId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 30000,
          },
        );
      } else {
        // Lookup by basket ID: GET /transaction/basket_id/<basket_id>
        const params: Record<string, string> = {};
        if (orderDate) {
          params.order_date = orderDate;
        }

        response = await axios.get(
          `${payfastBaseUrl}/basket_id/${basketId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params,
            timeout: 30000,
          },
        );
      }

      const data = response.data;

      if (!data) {
        throw new HttpException('PayFast API returned empty response', 502);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error.response) {
        throw new HttpException(
          `PayFast API error: ${error.response.data?.status_msg || error.message}`,
          error.response.status || 502,
        );
      }
      if (error.request) {
        throw new HttpException('PayFast API timeout or network error', 503);
      }
      throw new HttpException(`Failed to get PayFast order status: ${error.message}`, 500);
    }
  }

  /**
   * Map PayFast status_code to donation status
   * PayFast error codes:
   *   00  → Processed OK         → completed
   *   79  → Alternate Success     → completed
   *   001 → Pending               → pending
   *   002 → Timeout               → failed
   *   54  → Card Expired          → failed
   *   97  → Insufficient Balance  → failed
   *   106 → Transaction Limit     → failed
   *   9000→ Rejected by FRMS      → failed
   *   All others                  → failed
   * @param statusCode - PayFast status_code string
   * @returns Donation status string
   */
  private mapPayfastStatusToDonationStatus(statusCode: string): string {
    switch (statusCode) {
      case '00':
      case '79':
        return 'completed';
      case '001':
        return 'pending';
      case '002':  // timeout
      case '54':   // card expired
      case '97':   // insufficient balance
      case '106':  // transaction limit exceeded
      case '3':    // inactive account
      case '14':   // incorrect details / inactive card
      case '15':   // inactive card
      case '42':   // invalid CNIC
      case '55':   // invalid OTP/PIN
      case '75':   // max PIN retries exceeded
      case '13':   // invalid amount
      case '126':  // invalid account details
      case '423':  // unable to process
      case '41':   // mismatched details
      case '9000': // rejected by FRMS
        return 'failed';
      default:
        return 'failed';
    }
  }

  /**
   * Get PayFast donation status only - Calls PayFast API to get real-time status
   * Similar to getDonationStatusOnly for Meezan
   * @param donationId - Donation ID (used as basket_id)
   * @returns Promise with donation ID, status, and full PayFast response
   */
  async getDonationPayfastStatusOnly(donationId: number): Promise<{
    donationId: number;
    status: string;
    statusCode: string;
    statusMsg: string;
  }> {
    const donation = await this.donationRepository.findOne({ where: { id: donationId } });
    if (!donation) {
      throw new NotFoundException(`Donation with ID ${donationId} not found`);
    }

    try {
      const payfastStatus = await this.getPayfastOrderStatus(
        donationId.toString(),
        donation.orderId || undefined, // use transaction_id if we have it
      );

      const statusCode = payfastStatus?.status_code || '';
      const realTimeStatus = this.mapPayfastStatusToDonationStatus(statusCode);

      return {
        donationId,
        status: realTimeStatus,
        statusCode,
        statusMsg: payfastStatus?.status_msg || '',
      };
    } catch (error) {
      // If PayFast API fails, return current DB status
      console.error(`Failed to get PayFast status for donation ${donationId}:`, error.message);
      return {
        donationId,
        status: donation.status,
        statusCode: '',
        statusMsg: `Fallback to DB status: ${error.message}`,
      };
    }
  }

  /**
   * Unified provider status check - Detects the donation method and queries
   * the correct payment provider (PayFast, Meezan, Stripe, Blinq) for real-time status.
   * Also updates the donation record if the provider reports a different status.
   * @param donationId - Donation ID
   * @returns Provider status details + whether the DB was updated
   */
  async getProviderStatus(donationId: number): Promise<{
    donationId: number;
    provider: string;
    providerStatus: string;
    donationStatus: string;
    dbUpdated: boolean;
    details: any;
  }> {
    const donation = await this.donationRepository.findOne({
      where: { id: donationId },
      relations: ['donor'],
    });

    if (!donation) {
      throw new NotFoundException(`Donation with ID ${donationId} not found`);
    }

    const method = (donation.donation_method || '').toLowerCase();
    let providerStatus = '';
    let donationStatus = donation.status;
    let details: any = {};
    let provider = method;

    try {
      if (method === 'payfast') {
        const pfResult = await this.getPayfastOrderStatus(
          donationId.toString(),
          donation.orderId || undefined,
        );
        providerStatus = pfResult?.status_code || '';
        donationStatus = this.mapPayfastStatusToDonationStatus(providerStatus);
        details = {
          status_code: pfResult?.status_code,
          status_msg: pfResult?.status_msg,
          transaction_id: pfResult?.transaction_id,
          basket_id: pfResult?.basket_id,
          rdv_message_key: pfResult?.rdv_message_key,
        };
      } else if (method === 'meezan') {
        if (!donation.orderId) {
          return {
            donationId,
            provider,
            providerStatus: 'no_order_id',
            donationStatus: donation.status,
            dbUpdated: false,
            details: { message: 'No Meezan orderId found on this donation. Cannot query provider.' },
          };
        }
        const meezanResult = await this.getMeezanOrderStatusExtended(donation.orderId);
        providerStatus = String(meezanResult?.orderStatus ?? '');
        donationStatus = this.mapMeezanStatusToDonationStatus(Number(meezanResult?.orderStatus));
        details = {
          orderStatus: meezanResult?.orderStatus,
          actionCode: meezanResult?.actionCode,
          actionCodeDescription: meezanResult?.actionCodeDescription,
          amount: meezanResult?.amount,
          currency: meezanResult?.currency,
          date: meezanResult?.date,
          orderNumber: meezanResult?.orderNumber,
          errorCode: meezanResult?.errorCode,
          errorMessage: meezanResult?.errorMessage,
        };
      } else if (method === 'stripe' || method === 'stripe_embed') {
        // For Stripe, we don't have a direct status API here – return DB status
        return {
          donationId,
          provider,
          providerStatus: donation.status,
          donationStatus: donation.status,
          dbUpdated: false,
          details: { message: 'Stripe status is updated via webhooks. Showing current DB status.' },
        };
      } else if (method === 'blinq') {
        // Blinq status is callback-driven, no polling API available
        return {
          donationId,
          provider,
          providerStatus: donation.status,
          donationStatus: donation.status,
          dbUpdated: false,
          details: { message: 'Blinq status is updated via callback. Showing current DB status.' },
        };
      } else {
        // Manual methods (cash, bank_transfer, cheque, in_kind, etc.)
        return {
          donationId,
          provider: method || 'unknown',
          providerStatus: donation.status,
          donationStatus: donation.status,
          dbUpdated: false,
          details: { message: 'Manual donation method – no external provider to query.' },
        };
      }
    } catch (error) {
      console.error(`Provider status check failed for donation ${donationId} (${method}):`, error.message);
      return {
        donationId,
        provider,
        providerStatus: 'error',
        donationStatus: donation.status,
        dbUpdated: false,
        details: { error: error.message, message: 'Failed to reach payment provider. Showing current DB status.' },
      };
    }

    // Auto-update DB if provider status differs from current DB status
    let dbUpdated = false;
    if (donationStatus !== donation.status) {
      const updateData: any = { status: donationStatus };
      if (donationStatus === 'completed') {
        updateData.paid_amount = donation.amount;
      }
      await this.donationRepository.update(donationId, updateData);
      dbUpdated = true;

      // Dashboard aggregation
      if (donationStatus === 'completed') {
        this.dashboardAggregateService.applyDonationCompleted(donationId).catch((e) =>
          console.error(`Dashboard applyDonationCompleted failed for ${donationId}:`, e),
        );
      } else if (['refunded', 'reversed'].includes(donationStatus)) {
        this.dashboardAggregateService.applyDonationReversed(donationId).catch((e) =>
          console.error(`Dashboard applyDonationReversed failed for ${donationId}:`, e),
        );
      }
    }

    return {
      donationId,
      provider,
      providerStatus,
      donationStatus,
      dbUpdated,
      details,
    };
  }

  /**
   * Get donation by ID (for returnUrl redirect - no verification)
   * @param donationId - Donation ID
   * @returns Donation entity
   */
  async getDonationForRedirect(donationId: number): Promise<Donation> {
    const donation = await this.donationRepository.findOne({
      where: { id: donationId },
      relations: ['donor'],
    });

    if (!donation) {
      throw new NotFoundException(`Donation with ID ${donationId} not found`);
    }

    return donation;
  }

  /**
   * Get PayFast access token - Reusable helper method
   * @param basketId - Basket ID (usually donation ID)
   * @param amount - Transaction amount
   * @returns Promise with PayFast access token response
   */
  async getPayfastAccessToken(
    basketId: string,
    amount: number | string,
  ): Promise<any> {
    try {
      const payfastResponse = await this.payfastService.getAccessToken(
        basketId,
        amount,
      );
      return payfastResponse;
    } catch (error) {
      throw new HttpException(
        `Failed to get PayFast access token: ${error.message}`,
        500,
      );
    }
  }

  /**
   * Get Blinq access token - Reusable helper method
   * @returns Promise<string> - Authentication token
   */
  async getBlinqAccessToken(): Promise<string> {
    try {
      const blinq_url = 'https://api.blinq.pk/';
      const authPayload = {
        ClientID: process.env.BLINQ_ID?.toString(),
        ClientSecret: process.env.BLINQ_PASS?.toString(),
      };

      if (!authPayload.ClientID || !authPayload.ClientSecret) {
        throw new HttpException('Blinq credentials not configured', 500);
      }

      const authResponse = await axios.post(
        `${blinq_url}api/Auth`,
        authPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      // Try multiple possible token locations (headers or body)
      const authToken =
        authResponse?.headers?.token ||
        authResponse?.data?.token ||
        authResponse?.data?.data?.token;

      if (!authToken) {
        console.error('Blinq auth response structure:', {
          headers: authResponse?.headers,
          data: authResponse?.data,
        });
        throw new HttpException('Failed to get Blinq authentication token', 401);
      }

      return authToken;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(`Blinq authentication failed: ${error.message}`, 500);
    }
  }

  /**
   * Generate Blinq invoice - Reusable helper method
   * @param invoiceNumber - Invoice number (usually donation ID)
   * @param amount - Invoice amount
   * @param customerName - Customer name
   * @param authToken - Optional auth token (will fetch if not provided)
   * @returns Promise with invoice data including payment URL
   */
  async generateBlinqInvoice(
    invoiceNumber: string,
    amount: number | string,
    customerName: string = 'Anonymous',
    authToken?: string,
  ): Promise<{
    paymentUrl: string;
    paymentCode: string | null;
    invoiceData: any;
  }> {
    try {
      const blinq_url = 'https://api.blinq.pk/';
      const token = authToken || (await this.getBlinqAccessToken());

      // Calculate dates
      const currentDate = new Date();
      const dueDate = new Date(currentDate.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days later
      const validityDate = new Date(
        currentDate.getFullYear() + 1,
        currentDate.getMonth(),
        currentDate.getDate(),
      ); // 1 year later

      // Format dates to YYYY-MM-DD (local date, not UTC)
      const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const invoicePayload = [
        {
          InvoiceNumber: invoiceNumber,
          InvoiceAmount: amount.toString(),
          InvoiceDueDate: formatDate(dueDate),
          ValidityDate: formatDate(validityDate),
          InvoiceType: 'Service',
          IssueDate: formatDate(currentDate),
          CustomerName: customerName,
        },
      ];

      // Create invoice on Blinq
      const blinqInvoice = await axios.post(
        `${blinq_url}invoice/create`,
        invoicePayload,
        {
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
        },
      );

      // Extract and validate payment URL
      const detail = blinqInvoice?.data?.ResponseDetail?.[0];
      const paymentUrl = detail?.ClickToPayUrl;
      const paymentCode = detail?.PaymentCode || null;

      if (!paymentUrl) {
        console.error('Blinq invoice unexpected response:', blinqInvoice?.data);
        throw new HttpException(
          {
            message: 'Blinq invoice created but ClickToPayUrl missing',
            provider: 'blinq',
            invoiceNumber: invoiceNumber,
            providerResponse: blinqInvoice?.data,
          },
          502,
        );
      }

      return {
        paymentUrl,
        paymentCode,
        invoiceData: blinqInvoice?.data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(`Failed to create Blinq invoice: ${error.message}`, 500);
    }
  }

  /**
   * Update Meezan donation status ONLY from frontend payload (no Meezan verification).
   * Use this only if you intentionally trust the frontend for status.
   */
  async updateMeezanStatusFromPayload(
    donationId: number,
    payload: { status?: string; errorCode?: string; errorMessage?: string },
  ): Promise<{ donation: Donation; updated: boolean; message: string }> {
    const donation = await this.donationRepository.findOne({
      where: { id: donationId },
      relations: ['donor'],
    });

    if (!donation) {
      throw new NotFoundException(`Donation with ID ${donationId} not found`);
    }

    // idempotent: don't overwrite final statuses
    if (donation.status === 'completed' || donation.status === 'cancelled' || donation.status === 'refunded') {
      return {
        donation,
        updated: false,
        message: `Donation status is already "${donation.status}". No update needed.`,
      };
    }

    const incoming = (payload?.status || '').toLowerCase();
    const nextStatus =
      incoming === 'success' || incoming === 'completed'
        ? 'completed'
        : incoming === 'failed' || incoming === 'cancelled'
          ? 'failed'
          : 'pending';

    const updateData: any = {
      status: nextStatus,
    };

    if (nextStatus === 'completed') {
      updateData.paid_amount = donation.amount;
    }

    if (payload?.errorMessage || payload?.errorCode) {
      updateData.err_msg = payload?.errorMessage || `Meezan errorCode: ${payload?.errorCode}`;
    }

    await this.donationRepository.update(donationId, updateData);
    const updatedDonation = await this.donationRepository.findOne({
      where: { id: donationId },
      relations: ['donor'],
    });

    return {
      donation: updatedDonation,
      updated: true,
      message: `Donation status updated to "${nextStatus}"`,
    };
  }

  /**
   * Get only donation status - Calls Meezan API to get real-time status
   * This is the ONLY method that calls getMeezanOrderStatusExtended
   */
  async getDonationStatusOnly(donationId: number): Promise<{ donationId: number; status: string }> {
    const donation = await this.donationRepository.findOne({ where: { id: donationId } });
    if (!donation) {
      throw new NotFoundException(`Donation with ID ${donationId} not found`);
    }

    // If no orderId, return current DB status
    if (!donation.orderId) {
      return { donationId, status: donation.status };
    }

    // Call Meezan API to get real-time status (ONLY place this is called)
    try {
      const meezanStatus = await this.getMeezanOrderStatusExtended(donation.orderId);
      const orderStatus = meezanStatus.orderStatus;
      const realTimeStatus = this.mapMeezanStatusToDonationStatus(orderStatus);
      
      return { donationId, status: realTimeStatus };
    } catch (error) {
      // If Meezan API fails, return current DB status
      console.error(`Failed to get Meezan status for donation ${donationId}:`, error.message);
      return { donationId, status: donation.status };
    }
  }

  async create(createDonationDto: CreateDonationDto, user: any) {
    try {
     const meezan_url="https://acquiring.meezanbank.com/payment/rest/";
     const blinq_url="https://api.blinq.pk/";
     const manualDonationMethodOptions = ['cash','bank_transfer','credit_card','cheque','in_kind','online'];
     const onlineDonationMethodOptions = ['meezan','blinq','payfast','stripe','stripe_embed'];
    console.log("createDonationDto", createDonationDto);
    
    let donorId: number | null = createDonationDto.donor_id || null;
    let donor:any;
    let savedDonation:any;
    if(!createDonationDto?.previous_donation_id){ // if previous donation id is not provided, then we need to create a new donation and register donor if not exists then skip this
     // ============================================
     // AUTO-REGISTER DONOR IF NOT EXISTS & LINK TO DONATION
     // ============================================
     
     if (Number(createDonationDto?.amount) < 50){
      //  return with error that donation amount is less than 50
      throw new HttpException('Donation amount is less than 50 PKR', 400);
     }
     if (createDonationDto.donor_email && createDonationDto.donor_phone || donorId) {
       console.log(`🔍 Checking if donor exists: ${createDonationDto.donor_email} / ${createDonationDto.donor_phone}`);
       
       // Check if donor already exists with this email AND phone
       if(createDonationDto.donor_email && createDonationDto.donor_phone){
        donor = await this.donorService.findByEmail(
          createDonationDto.donor_email
        );
       }
       else if(donorId){
        donor = await this.donorService.findOne(donorId);
       }
       
       if (donor) {
         let alreadyMultiTimeDonor = donor?.multi_time_donor || false;
         if(!alreadyMultiTimeDonor) {
          donor.multi_time_donor = true;
          await this.donorRepository.save(donor);
          console.log(`✅ Donor is now a multi-time donor: ${donor.email} (ID: ${donor.id})`);
         }
         if (createDonationDto.notification_subscription !== undefined) {
          donor.notification_subscription = createDonationDto.notification_subscription;
          await this.donorRepository.save(donor);
         }
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
           address: createDonationDto?.address,
           notification_subscription: createDonationDto.notification_subscription,
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
    //   donation_frequency is monthly then insert record in recurring repository  also 
    if(createDonationDto?.donation_frequency && createDonationDto?.donation_frequency === 'monthly') {
      const recurringDonation = this.recurringDonationRepository.create({
        ...createDonationDto,
        donor_id: donorId,
      });
      savedDonation = await this.recurringDonationRepository.save(recurringDonation);
      // mark donor as recurring donor
      donor.recurring = true; 
      await this.donorRepository.save(donor);
    }
     // Validate campaign if provided
     let campaignId: number | null = createDonationDto?.campaign_id ?? null;
     if (campaignId) {
       try {
         const campaign = await this.campaignsService.findOne(campaignId);
         const isAdmin = user?.role === 'admin';
         if (!this.campaignsService.canAcceptDonation(campaign, isAdmin)) {
           throw new HttpException(
             `Campaign "${campaign.title}" is not accepting donations (status: ${campaign.status})`,
             400,
           );
         }
       } catch (e) {
         if (e instanceof HttpException) throw e;
         throw new HttpException('Campaign not found', 404);
       }
     }

     // Create donation with donor_id and campaign_id if available
     const donation =  this.donationRepository.create({
       ...createDonationDto,
       donor_id: donorId, // ✅ Link donation to donor
       campaign_id: campaignId,
       created_by: user?.id == -1 ? null : user?.id,
       recurrence_id: savedDonation?.id || 0, 
     });
      savedDonation = await this.donationRepository.save(donation);
     
     console.log(`💾 Donation saved with donor_id: ${donorId || 'null'} (Donation ID: ${savedDonation.id})`);

     if(createDonationDto?.previous_donation_id) {
      savedDonation = await this.donationRepository.findOne({
        where: { id: parseInt(createDonationDto.previous_donation_id) },
        relations: ['donor']
      });

      if(!savedDonation){
        throw new HttpException('Previous donation not found', 404);
      }
    }
    }
    //  await this.emailService.sendDonationFailureNotification(savedDonation);
     // Create notification for donation users (one notification, multiple user_notification records)
     try {
       const donationUsers = await this.getDonationUsers();
       
       // Filter to only valid, active users
       const validUserIds: number[] = [];
       for (const userId of donationUsers) {
         const userExists = await this.userRepository.findOne({
           where: { id: userId, isActive: true, is_archived: false },
           select: ['id'],
         });
         if (userExists) {
           validUserIds.push(userId);
         }
       }

       // Create one notification and assign it to all valid users
       if (validUserIds.length > 0) {
         await this.notificationsService.create(
           {
             title: 'New Donation Received',
             message: `A new donation attempt of ${savedDonation.amount} ${savedDonation.currency || 'PKR'} has been done ${donor?.name ? ` from ${donor.name}` : ''}.`,
             type: NotificationType.DONATION,
             link: `/donations/online_donations/view/${savedDonation.id}`,
             metadata: {
               donation_id: savedDonation.id,
               amount: savedDonation.amount,
               donation_type: savedDonation.donation_type,
               donation_method: savedDonation.donation_method,
             },
           },
           validUserIds, // Pass array of user IDs
           user
         );
       }
     } catch (error) {
       console.error('Failed to create notifications:', error.message);
     }

      if(createDonationDto.donation_method && createDonationDto.donation_method === 'meezan') {
      // Use reusable helper method to create Meezan invoice
      const meezanResult = await this.createMeezanInvoice(
        savedDonation.id,
        savedDonation.amount,
        savedDonation,
      );

      // Return payment URL for user to complete payment
      return {
        paymentUrl: meezanResult.paymentUrl,
      };
    }
    else if(createDonationDto.donation_method && createDonationDto.donation_method === 'blinq') {
      // Use reusable helper method to generate Blinq invoice
      const blinqResult = await this.generateBlinqInvoice(
        savedDonation.id.toString(),
        savedDonation.amount,
        donor?.name || 'Anonymous',
      );

      // Update donation with Blinq payment code and status
      savedDonation.status = 'registered';
      savedDonation.orderId = blinqResult.paymentCode || null;
      await this.donationRepository.save(savedDonation);

      // Return payment URL for user to complete payment
      return { paymentUrl: blinqResult.paymentUrl };
    }
    else if(createDonationDto.donation_method && createDonationDto.donation_method === 'payfast') {
      // Get complete response from Payfast
      const payfastResponse = await this.payfastService.getAccessToken(
        savedDonation.id.toString(),
        savedDonation.amount
      );

      // console.log("payfastResponse_____", payfastResponse);
      
      // Return complete Payfast response
      return {...payfastResponse, 
        BASKET_ID: savedDonation.id.toString(),
        TXNAMT: savedDonation.amount.toString(),
      };
    }
    else if(createDonationDto.donation_method && createDonationDto.donation_method === 'stripe') {
      const baseFrontendUrl = process.env.BASE_Frontend_URL || '';
      const stripeResult = await this.stripeService.createCheckoutSession({
        donationId: savedDonation.id,
        amount: savedDonation.amount,
        currency: savedDonation.currency || 'pkr',
        successUrl: `${baseFrontendUrl}/thanks?donation_id=${savedDonation.id}`,
        cancelUrl: `${baseFrontendUrl}/donate?cancelled=1`,
        donorEmail: donor?.email || createDonationDto.donor_email,
        donorName: donor?.name || createDonationDto.donor_name,
        isMonthly: createDonationDto.donation_frequency === 'monthly',
      });
      savedDonation.status = 'registered';
      savedDonation.orderId = stripeResult.sessionId;
      await this.donationRepository.save(savedDonation);
      return { paymentUrl: stripeResult.paymentUrl };
    }
    else if(createDonationDto.donation_method && createDonationDto.donation_method === 'stripe_embed') {
      const embedResult = await this.stripeService.createPaymentIntentForEmbed({
        donationId: savedDonation.id,
        amount: savedDonation.amount,
        currency: savedDonation.currency || 'pkr',
        donorEmail: donor?.email || createDonationDto.donor_email,
        donorName: donor?.name || createDonationDto.donor_name,
        isMonthly: createDonationDto.donation_frequency === 'monthly',
      });
      savedDonation.status = 'registered';
      savedDonation.orderId = embedResult.subscriptionId ?? embedResult.paymentIntentId;
      await this.donationRepository.save(savedDonation);
      return {
        clientSecret: embedResult.clientSecret,
        paymentIntentId: embedResult.paymentIntentId,
        donationId: savedDonation.id,
        ...(embedResult.subscriptionId && { subscriptionId: embedResult.subscriptionId }),
      };
    }
    else if(manualDonationMethodOptions.includes(createDonationDto.donation_method))  {
      // here we need to create a manual donation
      console.log("Created manually");
      if(createDonationDto.donation_method === 'in_kind') {
        
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
    multiselectFilters: any[] = [],
    relationsFilters?: Record<string, Record<string, any>>,
    user?: any
  ) {
    try {
      console.log("user email in donation listing", user?.email);
      console.log("multiselectFilters", multiselectFilters);
      const entitySearchFields = ['city'];
      const query = this.donationRepository.createQueryBuilder('donation')
      .leftJoin('donation.donor', 'donor')
      .addSelect('donor.name', 'donor_name')
      .addSelect('donor.id', 'donor_id')
      if(user?.email != 'mtjf_agency@example.com') {  
        query.addSelect('donor.email', 'donor_email')
        query.addSelect('donor.phone', 'donor_phone')
      }
      query.getRawMany();
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

      // 4) Multiselect filters multi select is object and we need to apply it to the query here is the example { columnName: ['1', '2', '3'] }
      if(multiselectFilters && Object.keys(multiselectFilters).length > 0) {
        console.log("here (multiselectFilters && multiselectFilters.length > 0", multiselectFilters)
        applyMultiselectFilters(query, multiselectFilters, 'donation');
      }
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
      if(multiselectFilters && Object.keys(multiselectFilters).length > 0) {
        console.log("here (multiselectFilters && multiselectFilters.length > 0")
        applyMultiselectFilters(sumQuery, multiselectFilters, 'donation');
      }
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

  /**
   * Update donation internal note (and stamp noted_by)
   */
  async updateNote(id: number, note: string | null, user: any) {
    try {
      const donation = await this.donationRepository.findOne({ where: { id } });
      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }

      await this.donationRepository.update(id, {
        note: note,
        noted_by: user?.id ?? null,
      } as any);

      return await this.donationRepository.findOne({ where: { id }, relations: ['donor'] });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update donation note: ${error.message}`);
    }
  }

  /**
   * Update donation status action
   * Only updates if the status is different from the current status
   * @param donationId - The donation ID to update
   * @param newStatus - The new status to set
   * @returns Updated donation object
   */
  async updateStatusAction(donationId: number, newStatus: string) {
    try {
      // Find the donation
      const donation = await this.donationRepository.findOne({ 
        where: { id: donationId },
        relations: ['donor']
      });

      if (!donation) {
        throw new NotFoundException(`Donation with ID ${donationId} not found`);
      }

      // Check if status is already the same
      if (donation.status === newStatus) {
        return {
          donation,
          updated: false,
          message: `Donation status is already "${newStatus}". No update needed.`,
        };
      }

      // Update the status
      await this.donationRepository.update(donationId, { status: newStatus });

      // Get updated donation
      const updatedDonation = await this.donationRepository.findOne({ 
        where: { id: donationId },
        relations: ['donor']
      });

      console.log(`Donation ${donationId} status updated from "${donation.status}" to "${newStatus}"`);

      // Dashboard aggregation: event-driven updates
      if (newStatus === 'completed') {
        this.dashboardAggregateService.applyDonationCompleted(donationId).catch((e) =>
          console.error(`Dashboard applyDonationCompleted failed for ${donationId}:`, e),
        );
      } else if (['refunded', 'reversed'].includes(newStatus)) {
        this.dashboardAggregateService.applyDonationReversed(donationId).catch((e) =>
          console.error(`Dashboard applyDonationReversed failed for ${donationId}:`, e),
        );
      }

      return {
        donation: updatedDonation,
        updated: true,
        previousStatus: donation.status,
        newStatus: newStatus,
        message: `Donation status updated successfully from "${donation.status}" to "${newStatus}"`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update donation status: ${error.message}`);
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
      } else if (payload.payment_method && payload.payment_method === 'stripe') {
        paymentMethod = 'stripe';
        donationId = payload.donation_id || payload.client_reference_id;
        console.log('Processing Stripe status update');
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
      } else if (paymentMethod === 'stripe') {
        if (payload.status === 'completed' || payload.status === 'success' || payload.payment_status === 'paid') {
          newStatus = 'completed';
        } else {
          newStatus = 'failed';
        }
        updateData = {
          status: newStatus,
          orderId: payload.order_id || payload.session_id || payload.id,
          err_msg: payload.error_message || payload.err_msg || null,
        };
      }

      // Update the donation
      await this.donationRepository.update(parseInt(donationId), updateData);

      // Dashboard aggregation: event-driven updates
      if (newStatus === 'completed') {
        this.dashboardAggregateService.applyDonationCompleted(parseInt(donationId)).catch((e) =>
          console.error(`Dashboard applyDonationCompleted failed for ${donationId}:`, e),
        );
      } else if (['refunded', 'reversed'].includes(newStatus)) {
        this.dashboardAggregateService.applyDonationReversed(parseInt(donationId)).catch((e) =>
          console.error(`Dashboard applyDonationReversed failed for ${donationId}:`, e),
        );
      }

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
      const donation = await this.donationRepository
        .createQueryBuilder('donation')
        .leftJoinAndSelect('donation.donor', 'donor')
        .where('donation.id = :id', { id: parseInt(basket_id) })
        .getOne();

      if (!donation) {
        throw new Error(`Donation with ID ${basket_id} not found in handlePayfastIpn`);
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
        // end success message and email if not sent already
        newStatus = 'completed';
        console.log("Donation marked as completed");
      } else {
        newStatus = 'failed';
        console.log("Donation marked as failed");
        
        // // Send failure email
        // await this.emailService.sendDonationFailureEmail(donation, {
        //   err_code,
        //   err_msg,
        //   transaction_id,
        //   donation_id: basket_id
        // }}); 
      }

      let message_sent: boolean = false;
      let email_sent: boolean = false;
      let send_message = donation?.message_sent == false && donation?.amount >= 5000 ? true : false;
      let send_email = donation?.email_sent == false && donation?.amount >= 5000 ? true : false;
      if (err_code === '000' || err_code === '00') {
        if(send_message){
          message_sent = true;
          await this.whatsAppService.sendPaymentConfirmation({
          phoneNumber: donation.donor.phone,
            userName: donation.donor.name,
            amount: donation.amount,
          });
          if(send_email){
            email_sent = true;
            await this.emailService.sendDonationSuccessEmail(donation, donation.donor, donation.donor.email);
          }
        }
      }
      else{
        if(send_message){
          message_sent = true;
          // send abandon message
          // need to finalize the  flow for this
          await this.whatsAppService.sendAbandonMessage({
            phoneNumber: donation.donor.phone,
            userName: donation.donor.name,
            amount: donation.amount,
            donationId: basket_id,
          });
          if(send_email){
            email_sent = true;
            await this.emailService.sendDonationFailureEmail(donation);
          }
        }
      }
        // Update donation
        await this.donationRepository.update(parseInt(basket_id), {
          orderId: transaction_id,
          status: newStatus,
          err_msg,
          message_sent,
          email_sent
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
  async updateDonationFromPublic(id: string, order_id: string, status: string) {
    try {
      console.log(`Updating donation ID: ${id} with order_id: ${order_id} with status: ${status}`);
      
      // Find donation by ID here add check if that donation is not completed already if completed then return success and not update the donation  
      const donation = await this.donationRepository.findOne({ 
        where: { id: Number(id) } 
      });

      if (!donation) {
        throw new NotFoundException(`Donation with ID ${id} not found`);
      }

        // Update only orderId and status
      await this.donationRepository.update(parseInt(id), {
        orderId: order_id,
        status: status
      });

      console.log(`Donation ${id} updated successfully with order_id: ${order_id} and status: ${status}`);
      
      return {
        id: parseInt(id),
        order_id: order_id,
        status: status,
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

  /**
   * Stripe webhook handler. Verifies signature, then updates donation on checkout.session.completed.
   * Expects raw body (Buffer) and Stripe-Signature header.
   */
  async handleStripeWebhook(rawBody: Buffer | string, signature: string): Promise<{ received: boolean; donationId?: number }> {
    const event = this.stripeService.constructWebhookEvent(rawBody, signature);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id?: string;
        client_reference_id?: string;
        payment_status?: string;
        mode?: string;
        subscription?: string;
      };
      const donationId = session.client_reference_id ? parseInt(session.client_reference_id, 10) : null;
      if (donationId && !isNaN(donationId)) {
        const donation = await this.donationRepository.findOne({ where: { id: donationId } });
        if (donation) {
          const orderIdForDonation =
            session.mode === 'subscription' && session.subscription
              ? session.subscription
              : session.id || donation.orderId;
          await this.donationRepository.update(donationId, {
            status: 'completed',
            orderId: orderIdForDonation,
          });
          this.dashboardAggregateService.applyDonationCompleted(donationId).catch((e) =>
            console.error(`Dashboard applyDonationCompleted failed for ${donationId}:`, e),
          );
          console.log(
            `Stripe webhook: Donation ${donationId} marked completed (${session.mode === 'subscription' ? 'subscription' : 'session'}: ${orderIdForDonation})`,
          );
          return { received: true, donationId };
        }
      }
    }
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as { id?: string; metadata?: { donation_id?: string } };
      const donationIdStr = paymentIntent.metadata?.donation_id;
      const donationId = donationIdStr ? parseInt(donationIdStr, 10) : null;
      if (donationId && !isNaN(donationId)) {
        const donation = await this.donationRepository.findOne({ where: { id: donationId } });
        if (donation) {
          await this.donationRepository.update(donationId, {
            status: 'completed',
            orderId: paymentIntent.id || donation.orderId,
          });
          this.dashboardAggregateService.applyDonationCompleted(donationId).catch((e) =>
            console.error(`Dashboard applyDonationCompleted failed for ${donationId}:`, e),
          );
          console.log(`Stripe webhook (embed): Donation ${donationId} marked completed (payment_intent: ${paymentIntent.id})`);
          return { received: true, donationId };
        }
      }
    }
    return { received: true };
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
      // const donation = await this.donationRepository.findOne({ 
      //   where: { id: parseInt(invoice_number) } 
      // });

      const donation = await this.donationRepository
        .createQueryBuilder('donation')
        .leftJoinAndSelect('donation.donor', 'donor')
        .where('donation.id = :id', { id: parseInt(invoice_number) })
        .getOne();

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
      let status:any ;
      let message_sent = false;
      let send_message = donation?.message_sent == false && donation?.amount >= 5000 ? true : false;
      let email_sent = false;
      let send_email = donation?.email_sent == false && donation?.amount >= 5000 ? true : false;
      if (invoice_status == 'PAID' && send_message && send_email) {
        status = 'completed';
        // send success message
        await this.whatsAppService.sendPaymentConfirmation({
          phoneNumber: donation.donor.phone,
          userName: donation.donor.name,
          amount: donation.amount,
        });
        message_sent = true;
        email_sent = true;
        await this.emailService.sendDonationSuccessEmail(donation, donation.donor, donation.donor.email);
      }
      else{
        status = 'failed'
        if(send_message){
        await this.whatsAppService.sendAbandonMessage({
          phoneNumber: donation.donor.phone,
          userName: donation.donor.name,
            amount: donation.amount,
            donationId: invoice_number,
          });
        }
        message_sent = true;
        if (send_email){
          email_sent = true;
          await this.emailService.sendDonationFailureEmail(donation);
        }
      }

      console.log("Found donation:", { id: donation.id, amount: donation.amount, status: donation.status });

      // Update donation status
      await this.donationRepository.update(parseInt(invoice_number), {
        orderId: payment_code,
        status: status,
        err_msg: `Paid via ${paid_via} - Bank: ${paid_bank}`,
        message_sent,
        email_sent
      });

      if (status === 'completed') {
        this.dashboardAggregateService.applyDonationCompleted(parseInt(invoice_number)).catch((e) =>
          console.error(`Dashboard applyDonationCompleted failed for ${invoice_number}:`, e),
        );
      }

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

  async getDonationListForDropdown(options?: { status?: string; paymentMethod?: string }) {
    const queryBuilder = this.donationRepository
      .createQueryBuilder('donation')
      .leftJoin('donation.donor', 'donor')
      .select([
        'donation.id',
        'donation.amount',
        'donation.status',
        'donation.payment_method',
        'donation.created_at',
        'donor.id',
        'donor.name'
      ]);

    if (options?.status) {
      queryBuilder.andWhere('donation.status = :status', { status: options.status });
    }

    if (options?.paymentMethod) {
      queryBuilder.andWhere('donation.payment_method = :paymentMethod', { paymentMethod: options.paymentMethod });
    }

    queryBuilder.orderBy('donation.created_at', 'DESC');

    const donations = await queryBuilder.getMany();

    return donations.map(donation => ({
      id: donation.id,
      amount: donation.amount,
      status: donation.status,
      // payment_method: donation.paymentMethod,
      created_at: donation.created_at,
      donor_id: donation.donor?.id || null,
      donor_name: donation.donor?.name || null,
    }));
  }


  /**
   * Get donation summary for a specific date range in Chart.js format
   * Supports: year, month, week, day, custom
   */
  async getSummary(options: DateRangeOptions = {}) {
    try {
      // Calculate date range
      DateRangeUtil.validateOptions(options);
      const dateRange = DateRangeUtil.calculateDateRange(options);

      // Extract date-only parts (YYYY-MM-DD) to match donation.date column format
      // The dateRange dates are timestamps (2023-12-31T19:00:00.000Z)
      // But donation.date is DATE type (2025-09-24), so we need to extract just the date part
      const startDateOnly = dateRange.startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const endDateOnly = dateRange.endDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Generate labels based on duration type using common utility
      const labels = DateRangeUtil.generateLabels(dateRange.durationType, dateRange.startDate, dateRange.endDate);

      // Helper to create base query builder
      // Using date column (DATE type) instead of created_at (TIMESTAMP)
      // Compare DATE types with date strings (YYYY-MM-DD format)
      const createBaseQuery = () => {
        return this.donationRepository
          .createQueryBuilder('donation')
          .where('donation.date >= :startDate', { startDate: startDateOnly })
          .andWhere('donation.date <= :endDate', { endDate: endDateOnly });
      };

      // Get time-series data based on duration type
      let timeSeriesData: any[] = [];

      switch (dateRange.durationType) {
        case 'year':
          // Group by month
          timeSeriesData = await createBaseQuery()
            .select("TO_CHAR(donation.date, 'Mon')", 'period')
            .addSelect('COUNT(donation.id)', 'count')
            .addSelect('SUM(donation.amount)', 'totalAmount')
            .addSelect('SUM(donation.paid_amount)', 'totalPaidAmount')
            .groupBy("TO_CHAR(donation.date, 'Mon')")
            .addGroupBy("EXTRACT(MONTH FROM donation.date)")
            .orderBy("EXTRACT(MONTH FROM donation.date)", 'ASC')
            .getRawMany();
          break;

        case 'month':
          // Group by day
          timeSeriesData = await createBaseQuery()
            .select("EXTRACT(DAY FROM donation.date)", 'period')
            .addSelect('COUNT(donation.id)', 'count')
            .addSelect('SUM(donation.amount)', 'totalAmount')
            .addSelect('SUM(donation.paid_amount)', 'totalPaidAmount')
            .groupBy("EXTRACT(DAY FROM donation.date)")
            .orderBy("EXTRACT(DAY FROM donation.date)", 'ASC')
            .getRawMany();
          break;

        case 'week':
          // Group by day of week
          timeSeriesData = await createBaseQuery()
            .select("TO_CHAR(donation.date, 'Dy')", 'period')
            .addSelect("EXTRACT(DOW FROM donation.date)", 'dayNum')
            .addSelect('COUNT(donation.id)', 'count')
            .addSelect('SUM(donation.amount)', 'totalAmount')
            .addSelect('SUM(donation.paid_amount)', 'totalPaidAmount')
            .groupBy("TO_CHAR(donation.date, 'Dy')")
            .addGroupBy("EXTRACT(DOW FROM donation.date)")
            .orderBy("EXTRACT(DOW FROM donation.date)", 'ASC')
            .getRawMany();
          break;

        case 'custom':
          // Determine grouping based on range length
          const daysDiff = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          if (daysDiff <= 31) {
            // Group by day - date column is already DATE type
            timeSeriesData = await createBaseQuery()
              .select("donation.date", 'period')
              .addSelect('COUNT(donation.id)', 'count')
              .addSelect('SUM(donation.amount)', 'totalAmount')
              .addSelect('SUM(donation.paid_amount)', 'totalPaidAmount')
              .groupBy("donation.date")
              .orderBy("donation.date", 'ASC')
              .getRawMany();
          } else if (daysDiff <= 365) {
            // Group by week
            timeSeriesData = await createBaseQuery()
              .select("DATE_TRUNC('week', donation.date)", 'period')
              .addSelect('COUNT(donation.id)', 'count')
              .addSelect('SUM(donation.amount)', 'totalAmount')
              .addSelect('SUM(donation.paid_amount)', 'totalPaidAmount')
              .groupBy("DATE_TRUNC('week', donation.date)")
              .orderBy("DATE_TRUNC('week', donation.date)", 'ASC')
              .getRawMany();
          } else {
            // Group by month
            timeSeriesData = await createBaseQuery()
              .select("DATE_TRUNC('month', donation.date)", 'period')
              .addSelect('COUNT(donation.id)', 'count')
              .addSelect('SUM(donation.amount)', 'totalAmount')
              .addSelect('SUM(donation.paid_amount)', 'totalPaidAmount')
              .groupBy("DATE_TRUNC('month', donation.date)")
              .orderBy("DATE_TRUNC('month', donation.date)", 'ASC')
              .getRawMany();
          }
          break;
      }

      // Map data to labels
      const mapDataToLabels = (dataKey: string, defaultValue: number = 0): number[] => {
        const dataMap = new Map<string, number>();
        
        timeSeriesData.forEach(item => {
          const period = item.period?.toString() || '';
          // Handle null values - convert to 0 if null/undefined
          const rawValue = item[dataKey];
          const value = rawValue === null || rawValue === undefined ? 0 : Number(rawValue || 0);
          
          // Handle different period formats based on duration type
          if (dateRange.durationType === 'year') {
            // Period is already month abbreviation (e.g., 'Sep', 'Oct')
            // Use it directly to match with MONTH_NAMES_SHORT
            if (period && MONTH_NAMES_SHORT.includes(period)) {
              dataMap.set(period, value);
            }
          } else if (dateRange.durationType === 'week') {
            // Period is day abbreviation (e.g., 'Mon', 'Tue')
            const dayNum = parseInt(item.dayNum || '0', 10);
            if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
              // PostgreSQL DOW: 0=Sunday, 1=Monday, ..., 6=Saturday
              // We want Monday=0, so adjust: Sunday (0) -> 6, others -> dayNum-1
              const adjustedDay = (dayNum === 0 ? 6 : dayNum - 1);
              // DAY_NAMES_SHORT starts with Monday, so use adjustedDay directly
              if (adjustedDay >= 0 && adjustedDay < DAY_NAMES_SHORT.length) {
                dataMap.set(DAY_NAMES_SHORT[adjustedDay], value);
              }
            }
          } else if (dateRange.durationType === 'month') {
            // For month, period is day number as string (e.g., '1', '15', '31')
            const dayNum = parseInt(period || '0', 10);
            if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
              dataMap.set(dayNum.toString(), value);
            }
          } else {
            // For custom ranges, use the period as-is
            dataMap.set(period, value);
          }
        });

        return labels.map(label => {
          // For custom ranges, try to match date formats more precisely
          if (dateRange.durationType === 'custom') {
            // Convert database date to label format for matching
            for (const [key, value] of dataMap.entries()) {
              if (key && typeof key === 'string') {
                try {
                  // If key is a date string, parse it
                  const keyDate = new Date(key);
                  if (!isNaN(keyDate.getTime())) {
                    // Match based on date format
                    const labelDate = label.includes('/') 
                      ? this.parseLabelDate(label, dateRange.startDate)
                      : null;
                    
                    if (labelDate && keyDate.toDateString() === labelDate.toDateString()) {
                      return value;
                    }
                  }
                  // Fallback: simple string matching
                  if (key.includes(label) || label.includes(key)) {
                    return value;
                  }
                } catch (e) {
                  // If parsing fails, use simple string matching
                  if (key.includes(label) || label.includes(key)) {
                    return value;
                  }
                }
              }
            }
          }
          return dataMap.get(label) || defaultValue;
        });
      };

      // Build datasets
      const datasets = [
        {
          label: 'Total Amount',
          data: mapDataToLabels('totalAmount', 0).map(val => Math.round(val * 100) / 100),
        },
        {
          label: 'Total Count',
          data: mapDataToLabels('count', 0),
        },
        {
          label: 'Paid Amount',
          data: mapDataToLabels('totalPaidAmount', 0).map(val => Math.round(val * 100) / 100),
        },
      ];

      return {
        dateRange: {
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
          durationType: dateRange.durationType,
          description: dateRange.description,
        },
        // Main time-series chart data
        chart: {
          labels,
          datasets,
        },
      };
    } catch (error) {
      throw new Error(`Failed to retrieve donation summary: ${error.message}`);
    }
  }

  /**
   * Helper to parse label date format (e.g., "15/3" -> Date object)
   */
  private parseLabelDate(label: string, referenceDate: Date): Date | null {
    try {
      const parts = label.split('/');
      if (parts.length === 2) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        if (!isNaN(day) && !isNaN(month) && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
          return new Date(referenceDate.getFullYear(), month, day);
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }
    return null;
  }
}