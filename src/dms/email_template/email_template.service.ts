import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { CreateEmailTemplateDto } from "./dto/create-email_template.dto";
import { UpdateEmailTemplateDto } from "./dto/update-email_template.dto";
import { EmailTemplate } from "./entities/email_template.entity";
import {
  CommunicationLog,
  CommunicationDeliveryStatus,
} from "./entities/communication-log.entity";
import {
  CommunicationBatch,
  CommunicationBatchStatus,
  CommunicationSelectionMode,
} from "./entities/communication-batch.entity";
import { Campaign } from "../campaigns/entities/campaign.entity";
import { Appeal } from "../appeals/entities/appeal.entity";
import { Event } from "../events/entities/event.entity";
import { Donor } from "../donor/entities/donor.entity";
import { DonorInteraction } from "../donor_relationship/entities/donor-interaction.entity";
import { DonorService } from "../donor/donor.service";
import { EmailService } from "../../email/email.service";
import { WhatsAppService } from "../../utils/services/whatsapp.service";
import { SendTemplateBulkDto, ResolveAudienceDto } from "./dto/template-send.dto";
import {
  appendCtaToBody,
  renderTemplateText,
} from "./utils/template-render.util";
import {
  TEMPLATE_VARIABLE_KEYS,
  CTA_BUTTON_TEXT_OPTIONS,
  TEMPLATE_CHANNELS,
  TEMPLATE_PURPOSES,
  TEMPLATE_STATUSES,
} from "./utils/template-variables.constants";

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly repository: Repository<EmailTemplate>,
    @InjectRepository(CommunicationLog)
    private readonly logRepository: Repository<CommunicationLog>,
    @InjectRepository(CommunicationBatch)
    private readonly batchRepository: Repository<CommunicationBatch>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(Appeal)
    private readonly appealRepository: Repository<Appeal>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Donor)
    private readonly donorRepository: Repository<Donor>,
    @InjectRepository(DonorInteraction)
    private readonly interactionRepository: Repository<DonorInteraction>,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly configService: ConfigService,
    private readonly donorService: DonorService,
  ) {}

  getMetadata() {
    return {
      channels: TEMPLATE_CHANNELS,
      purposes: TEMPLATE_PURPOSES,
      statuses: TEMPLATE_STATUSES,
      variables: TEMPLATE_VARIABLE_KEYS.map((key) => ({
        key,
        label: key.replace(/_/g, " "),
      })),
      ctaButtonTextOptions: CTA_BUTTON_TEXT_OPTIONS,
    };
  }

  private normalizeArrays(dto: Partial<CreateEmailTemplateDto>) {
    const normalized = { ...dto };
    for (const key of [
      "channels",
      "purposes",
      "campaign_ids",
      "appeal_ids",
      "event_ids",
      "variables",
    ] as const) {
      const val = normalized[key];
      if (Array.isArray(val) && val.length === 0) {
        normalized[key] = null;
      }
    }
    if (normalized.status) {
      normalized.is_active = normalized.status === "active";
    }
    return normalized;
  }

  async create(createDto: CreateEmailTemplateDto): Promise<EmailTemplate> {
    const template = this.repository.create(this.normalizeArrays(createDto));
    return await this.repository.save(template);
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    channels?: string;
    purposes?: string;
    statuses?: string;
  }) {
    const { page = 1, pageSize = 10, search, category } = params;
    const query = this.repository.createQueryBuilder("template");

    if (search) {
      query.andWhere(
        "(template.name ILIKE :search OR template.subject ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (category) {
      query.andWhere("template.category = :category", { category });
    }

    if (params.channels) {
      const channels = params.channels.split(",").filter(Boolean);
      channels.forEach((ch, index) => {
        query.andWhere(
          `(',' || COALESCE(template.channels, '') || ',') LIKE :channelPattern${index}`,
          { [`channelPattern${index}`]: `%,${ch},%` },
        );
      });
    }

    if (params.purposes) {
      const purposes = params.purposes.split(",").filter(Boolean);
      purposes.forEach((purpose, index) => {
        query.andWhere(
          `(',' || COALESCE(template.purposes, '') || ',') LIKE :purposePattern${index}`,
          { [`purposePattern${index}`]: `%,${purpose},%` },
        );
      });
    }

    if (params.statuses) {
      const statuses = params.statuses.split(",").filter(Boolean);
      if (statuses.length) {
        query.andWhere("template.status IN (:...statuses)", { statuses });
      }
    }

    query.andWhere("template.is_archived = false");

    const [items, total] = await query
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .orderBy("template.created_at", "DESC")
      .getManyAndCount();

    return {
      data: items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: number): Promise<EmailTemplate> {
    const template = await this.repository.findOne({
      where: { id, is_archived: false },
    });
    if (!template) {
      throw new NotFoundException(`Email template with ID ${id} not found`);
    }
    return template;
  }

  async update(
    id: number,
    updateDto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    const template = await this.findOne(id);
    Object.assign(template, this.normalizeArrays(updateDto));
    return await this.repository.save(template);
  }

  async remove(id: number): Promise<void> {
    const template = await this.findOne(id);
    template.is_archived = true;
    template.status = "archived";
    await this.repository.save(template);
  }

  async resolveSuggestedCtaUrl(template: EmailTemplate): Promise<string | null> {
    const baseUrl = this.getPublicBaseUrl();

    const campaignId = template.campaign_ids?.[0];
    if (campaignId) {
      const campaign = await this.campaignRepository.findOne({
        where: { id: Number(campaignId) },
      });
      if (campaign?.slug) return `${baseUrl}/campaigns/${campaign.slug}`;
    }

    const appealId = template.appeal_ids?.[0];
    if (appealId) {
      const appeal = await this.appealRepository.findOne({
        where: { id: Number(appealId) },
      });
      if (appeal?.slug) return `${baseUrl}/appeals/${appeal.slug}`;
    }

    const eventId = template.event_ids?.[0];
    if (eventId) {
      const event = await this.eventRepository.findOne({
        where: { id: Number(eventId) },
      });
      if (event?.slug) return `${baseUrl}/events/${event.slug}`;
    }

    return null;
  }

  async buildVariableContext(
    template: EmailTemplate,
    donor?: Donor | null,
    overrides: Record<string, string | number | null> = {},
  ): Promise<Record<string, string>> {
    const baseUrl = this.getPublicBaseUrl();
    const ctx: Record<string, string> = {
      donor_name: donor?.name || "Valued Donor",
      amount: "",
      campaign_name: "",
      appeal_name: "",
      event_name: "",
      campaign_url: "",
      appeal_url: "",
      event_url: "",
      donation_url: `${baseUrl}/donate`,
      cta_url: template.cta_url || "",
      cta_button_text: template.cta_button_text || "",
      unsubscribe_url: donor?.id
        ? `${baseUrl}/unsubscribe?donor=${donor.id}`
        : `${baseUrl}/unsubscribe`,
      current_month: "",
    };

    const campaignId = template.campaign_ids?.[0];
    if (campaignId) {
      const campaign = await this.campaignRepository.findOne({
        where: { id: Number(campaignId) },
      });
      if (campaign) {
        ctx.campaign_name = campaign.title;
        ctx.campaign_url = `${baseUrl}/campaigns/${campaign.slug}`;
        if (!ctx.cta_url) ctx.cta_url = ctx.campaign_url;
      }
    }

    const appealId = template.appeal_ids?.[0];
    if (appealId) {
      const appeal = await this.appealRepository.findOne({
        where: { id: Number(appealId) },
      });
      if (appeal) {
        ctx.appeal_name = appeal.title;
        ctx.appeal_url = `${baseUrl}/appeals/${appeal.slug}`;
        if (!ctx.cta_url) ctx.cta_url = ctx.appeal_url;
      }
    }

    const eventId = template.event_ids?.[0];
    if (eventId) {
      const event = await this.eventRepository.findOne({
        where: { id: Number(eventId) },
      });
      if (event) {
        ctx.event_name = event.title;
        ctx.event_url = `${baseUrl}/events/${event.slug}`;
        if (!ctx.cta_url) ctx.cta_url = ctx.event_url;
      }
    }

    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && value !== null) {
        ctx[key] = String(value);
      }
    }

    return ctx;
  }

  async preview(
    id: number,
    sampleData: Record<string, string | number | null> = {},
  ) {
    const template = await this.findOne(id);
    const context = await this.buildVariableContext(template, null, sampleData);
    const subject = renderTemplateText(template.subject || "", context);
    let body = renderTemplateText(template.body, context);
    body = appendCtaToBody(body, template.cta_button_text, context.cta_url);

    return {
      subject,
      body,
      context,
      suggested_cta_url: await this.resolveSuggestedCtaUrl(template),
    };
  }

  async previewForDonor(
    id: number,
    donorId: number,
    overrides: Record<string, string | number | null> = {},
  ) {
    const template = await this.findOne(id);
    const donor = await this.donorRepository.findOne({
      where: { id: donorId, is_archived: false },
    });
    if (!donor) {
      throw new NotFoundException(`Donor with ID ${donorId} not found`);
    }
    const context = await this.buildVariableContext(template, donor, overrides);
    const subject = renderTemplateText(template.subject || "", context);
    let body = renderTemplateText(template.body, context);
    body = appendCtaToBody(body, template.cta_button_text, context.cta_url);
    return { donor, subject, body, context };
  }

  async sendTest(
    id: number,
    channel: string,
    recipient: string,
    sampleData: Record<string, string | number | null> = {},
  ) {
    const template = await this.findOne(id);
    if (template.status !== "active") {
      throw new BadRequestException(
        "Only active templates can be used for test sends",
      );
    }
    if (template.channels?.length && !template.channels.includes(channel)) {
      throw new BadRequestException(
        `Template does not support channel: ${channel}`,
      );
    }

    const rendered = await this.preview(id, sampleData);
    const result = await this.dispatchMessage(
      channel,
      recipient,
      rendered.subject,
      rendered.body,
    );

    await this.logRepository.save(
      this.logRepository.create({
        template_id: template.id,
        donor_id: null,
        channel,
        recipient,
        subject: rendered.subject,
        body: rendered.body,
        delivery_status: result.success
          ? CommunicationDeliveryStatus.SENT
          : CommunicationDeliveryStatus.FAILED,
        sent_at: result.success ? new Date() : null,
        error_message: result.error || null,
        metadata: { test: true, context: rendered.context },
      }),
    );

    return { success: result.success, message: result.error || "Sent" };
  }

  async resolveAudience(
    user: { id?: number; role?: string; department?: string } | null | undefined,
    dto: ResolveAudienceDto,
  ) {
    return this.donorService.resolveCommunicationAudience(user, dto);
  }

  async sendBulk(
    id: number,
    dto: SendTemplateBulkDto,
    sentByUserId?: number | null,
    user?: { id?: number; role?: string; department?: string } | null,
  ) {
    const template = await this.findOne(id);
    if (template.status !== "active") {
      throw new BadRequestException("Only active templates can be sent");
    }
    if (template.channels?.length && !template.channels.includes(dto.channel)) {
      throw new BadRequestException(
        `Template does not support channel: ${dto.channel}`,
      );
    }
    if (dto.channel === "email" && !template.subject?.trim()) {
      throw new BadRequestException("Email templates require a subject");
    }

    const audience = await this.donorService.resolveCommunicationAudience(
      user,
      {
        selection_mode: dto.selection_mode,
        donor_ids: dto.donor_ids,
        donor_filters: dto.donor_filters,
      },
    );

    if (!audience.ids.length) {
      throw new BadRequestException("No donors matched the selected audience");
    }

    const donors = await this.donorRepository.find({
      where: { id: In(audience.ids), is_archived: false },
    });

    const scheduleDate = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
    const isScheduled = scheduleDate && scheduleDate.getTime() > Date.now();

    const batch = await this.batchRepository.save(
      this.batchRepository.create({
        template_id: template.id,
        template_name: template.name,
        channel: dto.channel,
        selection_mode:
          dto.selection_mode === "filters"
            ? CommunicationSelectionMode.FILTERS
            : CommunicationSelectionMode.MANUAL,
        filters:
          dto.selection_mode === "filters" ? audience.filters : null,
        donor_ids:
          dto.selection_mode === "manual"
            ? audience.ids.map(String)
            : null,
        matched_count: audience.total,
        sent_count: 0,
        failed_count: 0,
        scheduled_count: 0,
        scheduled_at: isScheduled ? scheduleDate : null,
        sent_at: isScheduled ? null : new Date(),
        sent_by_user_id: sentByUserId ?? null,
        batch_status: isScheduled
          ? CommunicationBatchStatus.SCHEDULED
          : CommunicationBatchStatus.COMPLETED,
      }),
    );

    const results = [];
    let sentCount = 0;
    let failedCount = 0;
    let scheduledCount = 0;

    for (const donor of donors) {
      const rendered = await this.previewForDonor(id, donor.id);
      const recipient =
        dto.channel === "email"
          ? donor.email
          : dto.channel === "whatsapp" || dto.channel === "sms"
            ? donor.phone
            : null;

      if (!recipient) {
        const log = await this.createCommunicationLog({
          template,
          batch,
          donor,
          channel: dto.channel,
          recipient: null,
          subject: rendered.subject,
          body: rendered.body,
          status: CommunicationDeliveryStatus.FAILED,
          error: `Donor has no ${dto.channel} contact`,
          scheduledAt: scheduleDate,
        });
        failedCount += 1;
        results.push({ donor_id: donor.id, success: false, log_id: log.id });
        continue;
      }

      if (isScheduled) {
        const log = await this.createCommunicationLog({
          template,
          batch,
          donor,
          channel: dto.channel,
          recipient,
          subject: rendered.subject,
          body: rendered.body,
          status: CommunicationDeliveryStatus.SCHEDULED,
          scheduledAt: scheduleDate,
          metadata: { context: rendered.context },
        });
        scheduledCount += 1;
        await this.recordDonorInteraction(template, donor, dto.channel, log);
        results.push({ donor_id: donor.id, success: true, log_id: log.id });
        continue;
      }

      const dispatch = await this.dispatchMessage(
        dto.channel,
        recipient,
        rendered.subject,
        rendered.body,
      );
      const log = await this.createCommunicationLog({
        template,
        batch,
        donor,
        channel: dto.channel,
        recipient,
        subject: rendered.subject,
        body: rendered.body,
        status: dispatch.success
          ? CommunicationDeliveryStatus.SENT
          : CommunicationDeliveryStatus.FAILED,
        error: dispatch.error,
        metadata: { context: rendered.context },
      });
      if (dispatch.success) sentCount += 1;
      else failedCount += 1;
      await this.recordDonorInteraction(
        template,
        donor,
        dto.channel,
        log,
        dispatch.success,
      );
      results.push({
        donor_id: donor.id,
        success: dispatch.success,
        log_id: log.id,
        error: dispatch.error,
      });
    }

    const batchStatus = isScheduled
      ? CommunicationBatchStatus.SCHEDULED
      : failedCount === 0 && sentCount > 0
        ? CommunicationBatchStatus.COMPLETED
        : sentCount === 0
          ? CommunicationBatchStatus.FAILED
          : CommunicationBatchStatus.PARTIAL;

    await this.batchRepository.update(batch.id, {
      sent_count: sentCount,
      failed_count: failedCount,
      scheduled_count: scheduledCount,
      batch_status: batchStatus,
      sent_at: isScheduled ? null : new Date(),
    });

    return {
      batch_id: batch.id,
      matched_count: audience.total,
      total: results.length,
      sent: sentCount,
      scheduled: scheduledCount,
      failed: failedCount,
      selection_mode: dto.selection_mode,
      filters: audience.filters,
      results,
    };
  }

  async findDefaultByPurposeAndChannel(purpose: string, channel: string) {
    return this.repository
      .createQueryBuilder("template")
      .where("template.is_archived = false")
      .andWhere("template.status = :status", { status: "active" })
      .andWhere(
        `(',' || COALESCE(template.purposes, '') || ',') LIKE :purposePattern`,
        { purposePattern: `%,${purpose},%` },
      )
      .andWhere(
        `(',' || COALESCE(template.channels, '') || ',') LIKE :channelPattern`,
        { channelPattern: `%,${channel},%` },
      )
      .orderBy("template.updated_at", "DESC")
      .getOne();
  }

  /** Used by automated jobs (cron) — no auth user required. */
  async sendAutomatedToDonor(params: {
    templateId: number;
    donorId: number;
    channel: "email" | "whatsapp" | "sms";
    overrides?: Record<string, string | number | null>;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; log_id?: number; error?: string }> {
    const template = await this.findOne(params.templateId);
    if (template.status !== "active") {
      return { success: false, error: "Template is not active" };
    }
    if (template.channels?.length && !template.channels.includes(params.channel)) {
      return {
        success: false,
        error: `Template does not support channel: ${params.channel}`,
      };
    }

    const rendered = await this.previewForDonor(
      params.templateId,
      params.donorId,
      params.overrides || {},
    );
    const recipient =
      params.channel === "email"
        ? rendered.donor.email
        : params.channel === "whatsapp" || params.channel === "sms"
          ? rendered.donor.phone
          : null;

    if (!recipient) {
      const log = await this.createCommunicationLog({
        template,
        donor: rendered.donor,
        channel: params.channel,
        recipient: null,
        subject: rendered.subject,
        body: rendered.body,
        status: CommunicationDeliveryStatus.FAILED,
        error: `Donor has no ${params.channel} contact`,
        metadata: params.metadata,
      });
      return {
        success: false,
        log_id: log.id,
        error: `Donor has no ${params.channel} contact`,
      };
    }

    const dispatch = await this.dispatchMessage(
      params.channel,
      recipient,
      rendered.subject,
      rendered.body,
    );
    const log = await this.createCommunicationLog({
      template,
      donor: rendered.donor,
      channel: params.channel,
      recipient,
      subject: rendered.subject,
      body: rendered.body,
      status: dispatch.success
        ? CommunicationDeliveryStatus.SENT
        : CommunicationDeliveryStatus.FAILED,
      error: dispatch.error,
      metadata: {
        ...(params.metadata || {}),
        context: rendered.context,
      },
    });
    await this.recordDonorInteraction(
      template,
      rendered.donor,
      params.channel,
      log,
      dispatch.success,
    );

    return {
      success: dispatch.success,
      log_id: log.id,
      error: dispatch.error,
    };
  }

  async findBatches(params: {
    page?: number;
    pageSize?: number;
    template_id?: number;
    channel?: string;
    batch_status?: string;
  }) {
    const { page = 1, pageSize = 20, template_id, channel, batch_status } =
      params;
    const query = this.batchRepository
      .createQueryBuilder("batch")
      .leftJoinAndSelect("batch.template", "template")
      .leftJoinAndSelect("batch.sent_by", "sent_by")
      .where("batch.is_archived = false");

    if (template_id)
      query.andWhere("batch.template_id = :template_id", { template_id });
    if (channel) query.andWhere("batch.channel = :channel", { channel });
    if (batch_status)
      query.andWhere("batch.batch_status = :batch_status", { batch_status });

    const [items, total] = await query
      .orderBy("batch.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      data: items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findBatchOne(id: number) {
    const batch = await this.batchRepository.findOne({
      where: { id, is_archived: false },
      relations: ["template", "sent_by"],
    });
    if (!batch) {
      throw new NotFoundException(`Communication batch ${id} not found`);
    }

    const logs = await this.logRepository.find({
      where: { batch_id: id, is_archived: false },
      relations: ["donor"],
      order: { created_at: "DESC" },
    });

    return { batch, logs };
  }

  async findLogs(params: {
    page?: number;
    pageSize?: number;
    donor_id?: number;
    template_id?: number;
    batch_id?: number;
    channel?: string;
    delivery_status?: string;
  }) {
    const {
      page = 1,
      pageSize = 20,
      donor_id,
      template_id,
      batch_id,
      channel,
      delivery_status,
    } = params;
    const query = this.logRepository
      .createQueryBuilder("log")
      .leftJoinAndSelect("log.donor", "donor")
      .leftJoinAndSelect("log.template", "template")
      .where("log.is_archived = false");

    if (donor_id) query.andWhere("log.donor_id = :donor_id", { donor_id });
    if (template_id)
      query.andWhere("log.template_id = :template_id", { template_id });
    if (batch_id) query.andWhere("log.batch_id = :batch_id", { batch_id });
    if (channel) query.andWhere("log.channel = :channel", { channel });
    if (delivery_status)
      query.andWhere("log.delivery_status = :delivery_status", {
        delivery_status,
      });

    const [items, total] = await query
      .orderBy("log.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      data: items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private getPublicBaseUrl(): string {
    return (
      this.configService.get<string>("BASE_Frontend_URL") ||
      this.configService.get<string>("PUBLIC_SITE_URL") ||
      "https://mtjfoundation.org"
    ).replace(/\/$/, "");
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  private async dispatchMessage(
    channel: string,
    recipient: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (channel === "email") {
        const sent = await this.emailService.sendDynamicEmail({
          to: recipient,
          subject,
          body,
          data: {},
        });
        return sent
          ? { success: true }
          : { success: false, error: "Email send failed" };
      }

      if (channel === "whatsapp") {
        const sent = await this.whatsAppService.sendTextMessage({
          phoneNumber: recipient,
          message: this.stripHtml(body),
        });
        return sent
          ? { success: true }
          : { success: false, error: "WhatsApp send failed" };
      }

      if (channel === "sms") {
        return {
          success: false,
          error: "SMS channel is not configured yet",
        };
      }

      return { success: false, error: `Unsupported channel: ${channel}` };
    } catch (err: any) {
      return { success: false, error: err?.message || "Send failed" };
    }
  }

  private async createCommunicationLog(params: {
    template: EmailTemplate;
    batch?: CommunicationBatch | null;
    donor: Donor | null;
    channel: string;
    recipient: string | null;
    subject: string;
    body: string;
    status: CommunicationDeliveryStatus;
    error?: string | null;
    scheduledAt?: Date | null;
    metadata?: Record<string, any>;
  }) {
    return this.logRepository.save(
      this.logRepository.create({
        batch_id: params.batch?.id ?? null,
        template_id: params.template.id,
        donor_id: params.donor?.id ?? null,
        channel: params.channel,
        recipient: params.recipient,
        subject: params.subject,
        body: params.body,
        delivery_status: params.status,
        scheduled_at: params.scheduledAt ?? null,
        sent_at:
          params.status === CommunicationDeliveryStatus.SENT
            ? new Date()
            : null,
        error_message: params.error ?? null,
        metadata: params.metadata ?? null,
      }),
    );
  }

  private async recordDonorInteraction(
    template: EmailTemplate,
    donor: Donor,
    channel: string,
    log: CommunicationLog,
    success = true,
  ) {
    const activityType =
      channel === "email"
        ? "email"
        : channel === "whatsapp"
          ? "whatsapp"
          : "sms";

    await this.interactionRepository.save(
      this.interactionRepository.create({
        donor_id: donor.id,
        activity_type: activityType,
        activity_datetime: new Date(),
        user_action_text: `Communication sent: "${template.name}" via ${channel}. Delivery: ${log.delivery_status}.`,
        donor_response_text: success ? null : log.error_message,
        status: success ? "completed" : "need_followup",
        custom_activity_title: `Template: ${template.name}`,
      }),
    );
  }
}
