import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, In } from "typeorm";
import { Donation } from "../../donations/entities/donation.entity";
import { DonationAttachment } from "../../donations/entities/donation-attachment.entity";
import { DonationBoxDonation, CollectionStatus } from "../donation_box/donation_box_donation/entities/donation_box_donation.entity";
import { RecurringDonation } from "../../donations/recurring_donations/entities/recurring-donation.entity";
import { RecurringDonationAttachment } from "../../donations/recurring_donations/entities/recurring-donation-attachment.entity";
import { Donor } from "../donor/entities/donor.entity";
import { User } from "../../users/user.entity";
import { DonationsService } from "../../donations/donations.service";
import { DonationBoxDonationService } from "../donation_box/donation_box_donation/donation_box_donation.service";
import { RecurringDonationsLedgerService } from "../../donations/recurring_donations/recurring-donations-ledger.service";
import {
  ReconciliationWorkbenchQueryDto,
} from "./dto/reconciliation-workbench-query.dto";
import {
  ReconciliationWorkbenchActionDto,
  BulkActionItemDto,
} from "./dto/reconciliation-workbench-action.dto";

export interface NormalizedWorkbenchItem {
  id: number;
  type: "offline" | "online" | "donation_box" | "recurring_subscription" | "recurring_installment";
  reference: string;
  logged_at: string;
  created_at: Date | string;
  donor_id?: number | null;
  donor_name: string;
  donor_contact: string;
  donor_phone?: string;
  donor_email?: string;
  amount: number;
  currency: string;
  context_info: string;
  bank_reference: string;
  created_by_name?: string;
  attachments: Array<{
    id?: number | string;
    url: string;
    name: string;
    type?: string;
  }>;
  has_attachment: boolean;
  status: string;
  age_days: number;
  raw_data?: Record<string, any>;
}

export interface WorkbenchKpiData {
  all_pending: { count: number; total_amount: number };
  age_0_3: { count: number; total_amount: number };
  age_4_7: { count: number; total_amount: number };
  age_8_15: { count: number; total_amount: number };
  age_over_15: { count: number; total_amount: number };
}

@Injectable()
export class ReconciliationWorkbenchService {
  private readonly logger = new Logger(ReconciliationWorkbenchService.name);

  constructor(
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(DonationBoxDonation)
    private readonly boxDonationRepo: Repository<DonationBoxDonation>,
    @InjectRepository(RecurringDonation)
    private readonly recurringRepo: Repository<RecurringDonation>,
    @InjectRepository(RecurringDonationAttachment)
    private readonly recurringAttachmentRepo: Repository<RecurringDonationAttachment>,
    @InjectRepository(Donor)
    private readonly donorRepo: Repository<Donor>,
    private readonly donationsService: DonationsService,
    private readonly donationBoxDonationService: DonationBoxDonationService,
    private readonly recurringLedgerService: RecurringDonationsLedgerService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Main query handler for Reconciliation Workbench.
   * Loads KPI summary and paginated items list according to filters.
   */
  async getWorkbenchData(
    query: ReconciliationWorkbenchQueryDto,
    currentUser: any,
  ): Promise<{
    kpis: WorkbenchKpiData;
    items: NormalizedWorkbenchItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const tab = query.tab || "all";
    const recurringSubTab = query.recurring_sub_tab || "installments";
    const ageBucket = query.age_bucket || "all";
    const search = (query.search || "").trim();
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));

    // 1. Gather pending items according to tab selection
    const allPendingItems: NormalizedWorkbenchItem[] = [];

    const shouldLoadOffline = tab === "all" || tab === "offline";
    const shouldLoadOnline = tab === "all" || tab === "online";
    const shouldLoadBox = tab === "all" || tab === "donation_box";
    const shouldLoadRecurring = tab === "all" || tab === "recurring";

    if (shouldLoadOffline) {
      const offlineItems = await this.fetchOfflineDonations(search, query.start_date, query.end_date);
      allPendingItems.push(...offlineItems);
    }

    if (shouldLoadOnline) {
      const onlineItems = await this.fetchOnlineDonations(search, query.start_date, query.end_date);
      allPendingItems.push(...onlineItems);
    }

    if (shouldLoadBox) {
      const boxItems = await this.fetchDonationBoxDonations(search, query.start_date, query.end_date);
      allPendingItems.push(...boxItems);
    }

    if (shouldLoadRecurring) {
      if (tab === "all") {
        // In "All" tab, load both recurring subscriptions and installments that have attachments
        const [subs, insts] = await Promise.all([
          this.fetchRecurringSubscriptions(search, query.start_date, query.end_date),
          this.fetchRecurringInstallments(search, query.start_date, query.end_date),
        ]);
        allPendingItems.push(...subs, ...insts);
      } else {
        // Tab is "recurring": load based on sub-tab
        if (recurringSubTab === "subscriptions") {
          const subs = await this.fetchRecurringSubscriptions(search, query.start_date, query.end_date);
          allPendingItems.push(...subs);
        } else {
          const insts = await this.fetchRecurringInstallments(search, query.start_date, query.end_date);
          allPendingItems.push(...insts);
        }
      }
    }

    // Sort descending by created_at / logged date
    allPendingItems.sort((a, b) => {
      const tA = new Date(a.created_at || a.logged_at).getTime() || 0;
      const tB = new Date(b.created_at || b.logged_at).getTime() || 0;
      return tB - tA;
    });

    // 2. Compute KPIs from all matching pending items (before age bucket filter)
    const kpis: WorkbenchKpiData = {
      all_pending: { count: 0, total_amount: 0 },
      age_0_3: { count: 0, total_amount: 0 },
      age_4_7: { count: 0, total_amount: 0 },
      age_8_15: { count: 0, total_amount: 0 },
      age_over_15: { count: 0, total_amount: 0 },
    };

    for (const item of allPendingItems) {
      const amt = Number(item.amount) || 0;
      kpis.all_pending.count += 1;
      kpis.all_pending.total_amount += amt;

      const days = item.age_days;
      if (days <= 3) {
        kpis.age_0_3.count += 1;
        kpis.age_0_3.total_amount += amt;
      } else if (days <= 7) {
        kpis.age_4_7.count += 1;
        kpis.age_4_7.total_amount += amt;
      } else if (days <= 15) {
        kpis.age_8_15.count += 1;
        kpis.age_8_15.total_amount += amt;
      } else {
        this.incrementOver15(kpis, amt);
      }
    }

    // 3. Filter items by age bucket if selected
    let filteredItems = allPendingItems;
    if (ageBucket === "0_3") {
      filteredItems = allPendingItems.filter((i) => i.age_days <= 3);
    } else if (ageBucket === "4_7") {
      filteredItems = allPendingItems.filter((i) => i.age_days >= 4 && i.age_days <= 7);
    } else if (ageBucket === "8_15") {
      filteredItems = allPendingItems.filter((i) => i.age_days >= 8 && i.age_days <= 15);
    } else if (ageBucket === "over_15") {
      filteredItems = allPendingItems.filter((i) => i.age_days > 15);
    }

    // 4. Paginate
    const total = filteredItems.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = filteredItems.slice(startIndex, startIndex + limit);

    return {
      kpis,
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  private incrementOver15(kpis: WorkbenchKpiData, amt: number) {
    kpis.age_over_15.count += 1;
    kpis.age_over_15.total_amount += amt;
  }

  private calculateAgeDays(dateVal: Date | string | null | undefined): number {
    if (!dateVal) return 0;
    const then = new Date(dateVal).getTime();
    if (!then || isNaN(then)) return 0;
    const diffMs = Date.now() - then;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  private formatUserName(user?: User | null): string {
    if (!user) return "—";
    const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return full || user.email || "—";
  }

  /**
   * Fetch Pending Offline Donations
   */
  private async fetchOfflineDonations(
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<NormalizedWorkbenchItem[]> {
    const qb = this.donationRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.donor", "donor")
      .leftJoinAndSelect("d.attachments", "att")
      .leftJoinAndSelect("d.created_by", "creator")
      .where("LOWER(COALESCE(d.status, '')) = :st", { st: "pending" })
      .andWhere("(d.is_archived IS FALSE OR d.is_archived IS NULL)")
      .andWhere("COALESCE(d.donation_source, '') != 'website'")
      .andWhere("COALESCE(d.donation_method, '') != 'in_kind'");

    if (startDate) {
      qb.andWhere("d.created_at >= :start", { start: startDate });
    }
    if (endDate) {
      qb.andWhere("d.created_at <= :end", { end: `${endDate} 23:59:59` });
    }

    if (search) {
      qb.andWhere(
        "(donor.name ILIKE :s OR donor.phone ILIKE :s OR donor.email ILIKE :s OR d.cheque_number ILIKE :s OR d.orderId ILIKE :s OR CAST(d.id AS TEXT) ILIKE :s)",
        { s: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return rows.map((r) => {
      const donorName = r.donor?.name || "Anonymous Donor";
      const donorPhone = r.donor?.phone || "";
      const donorEmail = r.donor?.email || "";
      const contact = [donorPhone, donorEmail].filter(Boolean).join(" • ") || "—";
      const ageDays = this.calculateAgeDays(r.created_at);
      const createdByName = this.formatUserName(r.created_by);

      const attachments: NormalizedWorkbenchItem["attachments"] = [];
      if (r.attachments && r.attachments.length > 0) {
        for (const a of r.attachments) {
          if (a.file_url) {
            attachments.push({
              id: a.id,
              url: a.file_url,
              name: a.file_name || a.description || "Slip Attachment",
              type: a.file_type || "document",
            });
          }
        }
      }

      const bankRef = [
        r.bank_name || r.bank,
        r.cheque_number ? `Cheque: ${r.cheque_number}` : r.orderId ? `Ref: ${r.orderId}` : r.tran_seq_no ? `Seq: ${r.tran_seq_no}` : null,
      ]
        .filter(Boolean)
        .join(" - ") || "Offline Reference";

      return {
        id: r.id,
        type: "offline",
        reference: `DN-${r.id}`,
        logged_at: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
        created_at: r.created_at,
        donor_id: r.donor_id || r.donor?.id || null,
        donor_name: donorName,
        donor_contact: contact,
        donor_phone: donorPhone,
        donor_email: donorEmail,
        amount: Number(r.amount) || 0,
        currency: r.currency || "PKR",
        context_info: r.donation_method ? r.donation_method.toUpperCase() : "Offline Donation",
        bank_reference: bankRef,
        created_by_name: createdByName,
        attachments,
        has_attachment: attachments.length > 0,
        status: r.status || "pending",
        age_days: ageDays,
        raw_data: {
          id: r.id,
          reference: `DN-${r.id}`,
          amount: r.amount,
          currency: r.currency || "PKR",
          donation_method: r.donation_method,
          donation_source: r.donation_source,
          bank_name: r.bank_name || r.bank,
          cheque_number: r.cheque_number,
          orderId: r.orderId,
          note: r.note,
          notes: r.note,
          status: r.status,
          created_by_name: createdByName,
          created_at: r.created_at,
        },
      };
    });
  }

  /**
   * Fetch Pending Online Donations
   */
  private async fetchOnlineDonations(
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<NormalizedWorkbenchItem[]> {
    const qb = this.donationRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.donor", "donor")
      .leftJoinAndSelect("d.attachments", "att")
      .leftJoinAndSelect("d.created_by", "creator")
      .where("LOWER(COALESCE(d.status, '')) = :st", { st: "pending" })
      .andWhere("(d.is_archived IS FALSE OR d.is_archived IS NULL)")
      .andWhere("d.donation_source = 'website'");

    if (startDate) {
      qb.andWhere("d.created_at >= :start", { start: startDate });
    }
    if (endDate) {
      qb.andWhere("d.created_at <= :end", { end: `${endDate} 23:59:59` });
    }

    if (search) {
      qb.andWhere(
        "(donor.name ILIKE :s OR donor.phone ILIKE :s OR donor.email ILIKE :s OR d.orderId ILIKE :s OR CAST(d.id AS TEXT) ILIKE :s)",
        { s: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return rows.map((r) => {
      const donorName = r.donor?.name || "Online Donor";
      const donorPhone = r.donor?.phone || "";
      const donorEmail = r.donor?.email || "";
      const contact = [donorPhone, donorEmail].filter(Boolean).join(" • ") || "—";
      const ageDays = this.calculateAgeDays(r.created_at);
      const createdByName = r.created_by ? this.formatUserName(r.created_by) : "Website / Online";

      const attachments: NormalizedWorkbenchItem["attachments"] = [];
      if (r.attachments && r.attachments.length > 0) {
        for (const a of r.attachments) {
          if (a.file_url) {
            attachments.push({
              id: a.id,
              url: a.file_url,
              name: a.file_name || a.description || "Slip Attachment",
              type: a.file_type || "document",
            });
          }
        }
      }

      const bankRef = [
        r.bank_name || r.bank || "Online Gateway",
        r.orderId ? `Order: ${r.orderId}` : r.tran_seq_no ? `Seq: ${r.tran_seq_no}` : null,
      ]
        .filter(Boolean)
        .join(" - ") || "Online Transaction";

      return {
        id: r.id,
        type: "online",
        reference: `DN-${r.id}`,
        logged_at: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
        created_at: r.created_at,
        donor_id: r.donor_id || r.donor?.id || null,
        donor_name: donorName,
        donor_contact: contact,
        donor_phone: donorPhone,
        donor_email: donorEmail,
        amount: Number(r.amount) || 0,
        currency: r.currency || "PKR",
        context_info: r.donation_method ? r.donation_method.toUpperCase() : "Online Donation",
        bank_reference: bankRef,
        created_by_name: createdByName,
        attachments,
        has_attachment: attachments.length > 0,
        status: r.status || "pending",
        age_days: ageDays,
        raw_data: {
          id: r.id,
          reference: `DN-${r.id}`,
          amount: r.amount,
          currency: r.currency || "PKR",
          donation_method: r.donation_method,
          donation_source: r.donation_source,
          bank_name: r.bank_name || r.bank,
          orderId: r.orderId,
          note: r.note,
          status: r.status,
          created_by_name: createdByName,
          created_at: r.created_at,
        },
      };
    });
  }

  /**
   * Fetch Pending Donation Box Donations
   */
  private async fetchDonationBoxDonations(
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<NormalizedWorkbenchItem[]> {
    const qb = this.boxDonationRepo
      .createQueryBuilder("dbd")
      .leftJoinAndSelect("dbd.donation_box", "box")
      .leftJoinAndSelect("dbd.created_by", "creator")
      .where("LOWER(COALESCE(dbd.status, '')) = :st", { st: CollectionStatus.PENDING });

    if (startDate) {
      qb.andWhere("dbd.created_at >= :start", { start: startDate });
    }
    if (endDate) {
      qb.andWhere("dbd.created_at <= :end", { end: `${endDate} 23:59:59` });
    }

    if (search) {
      qb.andWhere(
        "(dbd.collector_name ILIKE :s OR dbd.bank_deposit_slip_no ILIKE :s OR box.box_id_no ILIKE :s OR CAST(dbd.id AS TEXT) ILIKE :s)",
        { s: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return rows.map((r) => {
      const boxIdentifier = r.donation_box?.box_id_no
        ? `Box #${r.donation_box.box_id_no}`
        : `Box #${r.donation_box_id}`;
      const collector = r.collector_name || "Collector";
      const ageDays = this.calculateAgeDays(r.created_at);
      const createdByName = r.created_by ? this.formatUserName(r.created_by) : collector;

      const attachments: NormalizedWorkbenchItem["attachments"] = [];
      if (Array.isArray(r.photo_urls)) {
        r.photo_urls.forEach((url, idx) => {
          if (url && typeof url === "string") {
            attachments.push({
              url,
              name: `Box Collection Photo ${idx + 1}`,
              type: "image",
            });
          }
        });
      }

      const bankRef = [
        r.bank_name,
        r.bank_deposit_slip_no ? `Slip #${r.bank_deposit_slip_no}` : r.cheque_number ? `Cheque #${r.cheque_number}` : null,
      ]
        .filter(Boolean)
        .join(" - ") || "Donation Box Collection";

      return {
        id: r.id,
        type: "donation_box",
        reference: `DB-${r.id}`,
        logged_at: r.collection_date
          ? String(r.collection_date).split("T")[0]
          : r.created_at
          ? new Date(r.created_at).toISOString().split("T")[0]
          : "",
        created_at: r.created_at,
        donor_name: collector,
        donor_contact: boxIdentifier,
        amount: Number(r.collection_amount) || 0,
        currency: "PKR",
        context_info: boxIdentifier,
        bank_reference: bankRef,
        created_by_name: createdByName,
        attachments,
        has_attachment: attachments.length > 0,
        status: r.status || "pending",
        age_days: ageDays,
        raw_data: {
          id: r.id,
          reference: `DB-${r.id}`,
          collection_amount: r.collection_amount,
          collection_date: r.collection_date,
          collector_name: r.collector_name,
          donation_box_id: r.donation_box_id,
          box_id_no: r.donation_box?.box_id_no,
          bank_name: r.bank_name,
          bank_deposit_slip_no: r.bank_deposit_slip_no,
          cheque_number: r.cheque_number,
          notes: r.notes,
          status: r.status,
          created_by_name: createdByName,
          created_at: r.created_at,
        },
      };
    });
  }

  /**
   * Fetch Pending Recurring Subscriptions (ONLY those with attachments)
   * Enforces: EXISTS (SELECT 1 FROM recurring_donation_attachments WHERE recurring_donation_id = sub.id)
   */
  private async fetchRecurringSubscriptions(
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<NormalizedWorkbenchItem[]> {
    const qb = this.recurringRepo
      .createQueryBuilder("rd")
      .leftJoinAndSelect("rd.attachments", "att")
      .leftJoinAndSelect("rd.created_by", "creator")
      .where("rd.parent_id IS NULL")
      .andWhere("LOWER(COALESCE(rd.status, '')) = :st", { st: "pending" })
      .andWhere("(rd.is_archived IS FALSE OR rd.is_archived IS NULL)")
      // MUST HAVE ATTACHMENT
      .andWhere(
        `EXISTS (
          SELECT 1 FROM recurring_donation_attachments rda 
          WHERE rda.recurring_donation_id = rd.id
        )`,
      );

    if (startDate) {
      qb.andWhere("rd.created_at >= :start", { start: startDate });
    }
    if (endDate) {
      qb.andWhere("rd.created_at <= :end", { end: `${endDate} 23:59:59` });
    }

    const rows = await qb.getMany();

    // Batch load donors
    const donorIds = [...new Set(rows.map((r) => r.donor_id).filter((id): id is number => Boolean(id)))];
    const donorMap = new Map<number, Donor>();
    if (donorIds.length > 0) {
      const donors = await this.donorRepo.findBy({ id: In(donorIds) });
      for (const d of donors) {
        donorMap.set(d.id, d);
      }
    }

    const normalized = rows.map((r) => {
      const donor = r.donor_id ? donorMap.get(r.donor_id) : null;
      const donorName = donor?.name || "Recurring Donor";
      const donorPhone = donor?.phone || "";
      const donorEmail = donor?.email || "";
      const contact = [donorPhone, donorEmail].filter(Boolean).join(" • ") || "—";
      const ageDays = this.calculateAgeDays(r.created_at);
      const createdByName = r.created_by ? this.formatUserName(r.created_by) : "Staff";

      const attachments: NormalizedWorkbenchItem["attachments"] = (r.attachments || [])
        .filter((a) => Boolean(a.file_url))
        .map((a) => ({
          id: a.id,
          url: a.file_url,
          name: a.file_name || a.description || "Recurring Slip",
          type: a.file_type || "document",
        }));

      const intervalText = r.billing_interval
        ? `${r.billing_interval.charAt(0).toUpperCase() + r.billing_interval.slice(1)} Subscription`
        : "Subscription Plan";

      const bankRef = [r.donation_method, r.stripe_subscription_id ? `Sub: ${r.stripe_subscription_id}` : null]
        .filter(Boolean)
        .join(" - ") || "Bank Transfer";

      return {
        id: r.id,
        type: "recurring_subscription" as const,
        reference: `RD-${r.id}`,
        logged_at: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
        created_at: r.created_at,
        donor_id: r.donor_id || null,
        donor_name: donorName,
        donor_contact: contact,
        donor_phone: donorPhone,
        donor_email: donorEmail,
        amount: Number(r.amount) || Number(r.total_amount) || 0,
        currency: r.currency || "PKR",
        context_info: intervalText,
        bank_reference: bankRef,
        created_by_name: createdByName,
        attachments,
        has_attachment: attachments.length > 0,
        status: r.status || "pending",
        age_days: ageDays,
        raw_data: {
          id: r.id,
          reference: `RD-${r.id}`,
          amount: r.amount,
          total_amount: r.total_amount,
          currency: r.currency || "PKR",
          donation_method: r.donation_method,
          billing_interval: r.billing_interval,
          billing_interval_count: r.billing_interval_count,
          status: r.status,
          created_by_name: createdByName,
          created_at: r.created_at,
        },
      };
    });

    if (search) {
      const q = search.toLowerCase();
      return normalized.filter(
        (item) =>
          item.donor_name.toLowerCase().includes(q) ||
          item.donor_contact.toLowerCase().includes(q) ||
          item.reference.toLowerCase().includes(q),
      );
    }

    return normalized;
  }

  /**
   * Fetch Pending Recurring Installments (ONLY those with attachments)
   * Enforces: EXISTS (SELECT 1 FROM recurring_donation_attachments WHERE recurring_donation_id = inst.id OR recurring_donation_id = inst.parent_id)
   */
  private async fetchRecurringInstallments(
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<NormalizedWorkbenchItem[]> {
    const qb = this.recurringRepo
      .createQueryBuilder("inst")
      .leftJoinAndSelect("inst.attachments", "att")
      .leftJoinAndSelect("inst.created_by", "creator")
      .where("inst.parent_id IS NOT NULL")
      .andWhere("LOWER(COALESCE(inst.status, '')) = :st", { st: "pending" })
      .andWhere("(inst.is_archived IS FALSE OR inst.is_archived IS NULL)")
      // MUST HAVE ATTACHMENT (either attached directly to installment or to parent subscription)
      .andWhere(
        `EXISTS (
          SELECT 1 FROM recurring_donation_attachments rda 
          WHERE rda.recurring_donation_id = inst.id OR rda.recurring_donation_id = inst.parent_id
        )`,
      );

    if (startDate) {
      qb.andWhere("inst.created_at >= :start", { start: startDate });
    }
    if (endDate) {
      qb.andWhere("inst.created_at <= :end", { end: `${endDate} 23:59:59` });
    }

    const rows = await qb.getMany();

    // Collect parent IDs to load parent attachments / parent subscriptions info if needed
    const parentIds = [...new Set(rows.map((r) => r.parent_id).filter((id): id is number => Boolean(id)))];
    let parentSubscriptionsMap = new Map<number, RecurringDonation>();
    let parentAttachmentsMap = new Map<number, RecurringDonationAttachment[]>();

    if (parentIds.length > 0) {
      const parents = await this.recurringRepo
        .createQueryBuilder("p")
        .leftJoinAndSelect("p.attachments", "patt")
        .leftJoinAndSelect("p.created_by", "pcreator")
        .where("p.id IN (:...parentIds)", { parentIds })
        .getMany();

      for (const p of parents) {
        parentSubscriptionsMap.set(p.id, p);
        if (p.attachments && p.attachments.length > 0) {
          parentAttachmentsMap.set(p.id, p.attachments);
        }
      }
    }

    // Collect all donor IDs (from installment or parent)
    const donorIds: number[] = [];
    for (const r of rows) {
      if (r.donor_id) donorIds.push(r.donor_id);
      const parent = r.parent_id ? parentSubscriptionsMap.get(r.parent_id) : null;
      if (parent?.donor_id) donorIds.push(parent.donor_id);
    }
    const uniqueDonorIds = [...new Set(donorIds)];
    const donorMap = new Map<number, Donor>();
    if (uniqueDonorIds.length > 0) {
      const donors = await this.donorRepo.findBy({ id: In(uniqueDonorIds) });
      for (const d of donors) {
        donorMap.set(d.id, d);
      }
    }

    const normalized = rows.map((r) => {
      const parent = r.parent_id ? parentSubscriptionsMap.get(r.parent_id) : null;
      const donorId = r.donor_id || parent?.donor_id;
      const donor = donorId ? donorMap.get(donorId) : null;
      const donorName = donor?.name || "Recurring Donor";
      const donorPhone = donor?.phone || "";
      const donorEmail = donor?.email || "";
      const contact = [donorPhone, donorEmail].filter(Boolean).join(" • ") || "—";
      const ageDays = this.calculateAgeDays(r.created_at);

      const createdByName = r.created_by
        ? this.formatUserName(r.created_by)
        : parent?.created_by
        ? this.formatUserName(parent.created_by)
        : "Staff";

      // Consolidate attachments: from installment itself or parent subscription
      const directAtts = (r.attachments || [])
        .filter((a) => Boolean(a.file_url))
        .map((a) => ({
          id: a.id,
          url: a.file_url,
          name: a.file_name || a.description || "Installment Slip",
          type: a.file_type || "document",
        }));

      const parentAtts = (parent?.id ? parentAttachmentsMap.get(parent.id) || [] : [])
        .filter((a) => Boolean(a.file_url))
        .map((a) => ({
          id: a.id,
          url: a.file_url,
          name: a.file_name || a.description || "Subscription Slip",
          type: a.file_type || "document",
        }));

      const combinedAtts = [...directAtts];
      for (const pa of parentAtts) {
        if (!combinedAtts.some((ca) => ca.url === pa.url)) {
          combinedAtts.push(pa);
        }
      }

      // Display installment numbering
      const periodLabel = r.period_key || "Period";
      const instLabel = `Inst. #${r.id} (${periodLabel})`;

      const bankRef = [
        r.donation_method || parent?.donation_method,
        r.period_key ? `Period: ${r.period_key}` : null,
      ]
        .filter(Boolean)
        .join(" - ") || "Installment Payment";

      return {
        id: r.id,
        type: "recurring_installment" as const,
        reference: `RD-${r.parent_id || r.id}`,
        logged_at: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
        created_at: r.created_at,
        donor_id: donorId || null,
        donor_name: donorName,
        donor_contact: contact,
        donor_phone: donorPhone,
        donor_email: donorEmail,
        amount: Number(r.amount) || (parent ? Number(parent.amount) : 0),
        currency: r.currency || parent?.currency || "PKR",
        context_info: instLabel,
        bank_reference: bankRef,
        created_by_name: createdByName,
        attachments: combinedAtts,
        has_attachment: combinedAtts.length > 0,
        status: r.status || "pending",
        age_days: ageDays,
        raw_data: {
          id: r.id,
          installment_id: r.id,
          subscription_id: r.parent_id,
          reference: `RD-${r.parent_id || r.id}`,
          period_key: r.period_key,
          amount: r.amount || parent?.amount,
          currency: r.currency || parent?.currency || "PKR",
          donation_method: r.donation_method || parent?.donation_method,
          status: r.status,
          created_by_name: createdByName,
          created_at: r.created_at,
        },
      };
    });

    if (search) {
      const q = search.toLowerCase();
      return normalized.filter(
        (item) =>
          item.donor_name.toLowerCase().includes(q) ||
          item.donor_contact.toLowerCase().includes(q) ||
          item.reference.toLowerCase().includes(q),
      );
    }

    return normalized;
  }

  /**
   * Approve single workbench item
   */
  async approveItem(
    dto: ReconciliationWorkbenchActionDto,
    currentUser: any,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const { type, id, notes } = dto;
    const userId = currentUser?.id ? Number(currentUser.id) : null;

    if (type === "offline" || type === "online") {
      const result = await this.donationsService.updateStatusAction(
        id,
        "completed",
        currentUser,
      );
      return {
        success: true,
        message: result.message || "Donation approved and verified successfully",
        data: result,
      };
    }

    if (type === "donation_box") {
      const result = await this.donationBoxDonationService.update(
        id,
        {
          status: CollectionStatus.VERIFIED,
          notes: notes || undefined,
        } as any,
        userId || undefined,
      );
      return {
        success: true,
        message: "Donation box collection verified successfully",
        data: result,
      };
    }

    if (type === "recurring_installment") {
      const inst = await this.recurringRepo.findOne({
        where: { id },
      });
      if (!inst) {
        throw new NotFoundException(`Installment #${id} not found`);
      }
      if (!inst.parent_id) {
        throw new BadRequestException(`Installment #${id} does not have a parent subscription`);
      }

      const result = await this.recurringLedgerService.markInstallmentsPaid(
        inst.parent_id,
        {
          installmentIds: [id],
          note: notes || "Approved via Reconciliation Workbench",
        },
        userId,
      );

      return {
        success: true,
        message: "Recurring installment marked as complete successfully",
        data: result,
      };
    }

    if (type === "recurring_subscription") {
      const sub = await this.recurringRepo.findOne({
        where: { id },
      });
      if (!sub) {
        throw new NotFoundException(`Subscription #${id} not found`);
      }

      await this.recurringRepo.update(id, {
        status: "active",
      });

      return {
        success: true,
        message: "Recurring subscription approved and activated successfully",
        data: { id, status: "active" },
      };
    }

    throw new BadRequestException(`Unsupported item type: ${type}`);
  }

  /**
   * Reject single workbench item
   */
  async rejectItem(
    dto: ReconciliationWorkbenchActionDto,
    currentUser: any,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const { type, id, notes, reason } = dto;
    const rejectionReason = reason || notes || "Rejected in reconciliation workbench";
    const userId = currentUser?.id ? Number(currentUser.id) : null;

    if (type === "offline" || type === "online") {
      const result = await this.donationsService.updateStatusAction(
        id,
        "failed",
        currentUser,
      );
      return {
        success: true,
        message: "Donation rejected successfully",
        data: result,
      };
    }

    if (type === "donation_box") {
      const result = await this.donationBoxDonationService.update(
        id,
        {
          status: CollectionStatus.CANCELLED,
          discrepancy_notes: rejectionReason,
        } as any,
        userId || undefined,
      );
      return {
        success: true,
        message: "Donation box collection rejected successfully",
        data: result,
      };
    }

    if (type === "recurring_installment") {
      await this.recurringRepo.update(id, {
        status: "failed",
      });
      return {
        success: true,
        message: "Recurring installment marked as failed",
        data: { id, status: "failed" },
      };
    }

    if (type === "recurring_subscription") {
      await this.recurringRepo.update(id, {
        status: "cancelled",
      });
      return {
        success: true,
        message: "Recurring subscription cancelled",
        data: { id, status: "cancelled" },
      };
    }

    throw new BadRequestException(`Unsupported item type: ${type}`);
  }

  /**
   * Bulk Approve workbench items
   */
  async bulkApprove(
    dto: { items: BulkActionItemDto[]; notes?: string },
    currentUser: any,
  ): Promise<{ approved: number; failed: number; errors: string[] }> {
    let approved = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of dto.items) {
      try {
        await this.approveItem(
          {
            type: item.type,
            id: item.id,
            notes: dto.notes,
          },
          currentUser,
        );
        approved++;
      } catch (err: any) {
        failed++;
        errors.push(`${item.type} #${item.id}: ${err.message}`);
      }
    }

    return { approved, failed, errors };
  }
}
