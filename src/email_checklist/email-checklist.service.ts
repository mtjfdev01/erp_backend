import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GmailConnection } from "./entities/gmail-connection.entity";
import { EmailChecklistItem } from "./entities/email-checklist-item.entity";
import { GmailService } from "./gmail.service";

@Injectable()
export class EmailChecklistService {
  private readonly logger = new Logger(EmailChecklistService.name);

  constructor(
    @InjectRepository(GmailConnection)
    private readonly connectionRepo: Repository<GmailConnection>,
    @InjectRepository(EmailChecklistItem)
    private readonly itemRepo: Repository<EmailChecklistItem>,
    private readonly gmailService: GmailService,
  ) {}

  async getConnectionStatus(userId: number, redirectUri: string) {
    const connection = await this.connectionRepo.findOne({
      where: { user_id: userId },
    });

    const google_signin_ready = await this.gmailService.isAppConfigured();

    if (!connection) {
      return {
        connected: false,
        gmail_email: null,
        last_synced_at: null,
        google_signin_ready,
        redirect_uri: redirectUri,
      };
    }

    return {
      connected: true,
      gmail_email: connection.gmail_email,
      last_synced_at: connection.last_synced_at,
      inbox_sync_from: connection.inbox_sync_from,
      google_signin_ready,
      redirect_uri: redirectUri,
    };
  }

  getAppConfig(redirectUri: string) {
    return this.gmailService.getAppConfigPublic(redirectUri);
  }

  saveAppConfig(clientId: string, redirectUri: string, clientSecret?: string) {
    return this.gmailService.saveAppConfig(clientId, redirectUri, clientSecret);
  }

  async getGmailAuthUrl(
    userId: number,
    redirectUri: string,
    frontendUrl: string,
  ) {
    const url = await this.gmailService.getAuthUrl(
      userId,
      redirectUri,
      frontendUrl,
    );
    return { url };
  }

  async handleOAuthCallback(
    code: string,
    state: string,
    fallbackRedirectUri: string,
  ) {
    const tokens = await this.gmailService.exchangeCodeForTokens(
      code,
      state,
      fallbackRedirectUri,
    );
    const existing = await this.connectionRepo.findOne({
      where: { user_id: tokens.userId },
    });

    if (existing) {
      existing.gmail_email = tokens.gmailEmail;
      existing.access_token = tokens.accessToken;
      existing.refresh_token = tokens.refreshToken;
      existing.token_expiry = tokens.tokenExpiry;
      if (!existing.inbox_sync_from) {
        existing.inbox_sync_from = new Date();
      }
      await this.connectionRepo.save(existing);
    } else {
      const syncFrom = new Date();
      await this.connectionRepo.save(
        this.connectionRepo.create({
          user_id: tokens.userId,
          gmail_email: tokens.gmailEmail,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expiry: tokens.tokenExpiry,
          inbox_sync_from: syncFrom,
        }),
      );
    }

    await this.syncUserInbox(tokens.userId, fallbackRedirectUri);
    return {
      userId: tokens.userId,
      gmail_email: tokens.gmailEmail,
      frontendUrl: tokens.frontendUrl,
    };
  }

  async disconnectGmail(userId: number) {
    await this.connectionRepo.delete({ user_id: userId });
    return { disconnected: true };
  }

  async listItems(userId: number, showDone = false) {
    const where: { user_id: number; is_done?: boolean } = { user_id: userId };
    if (!showDone) {
      where.is_done = false;
    }

    return this.itemRepo.find({
      where,
      order: { is_done: "ASC", received_at: "DESC", created_at: "DESC" },
    });
  }

  async toggleItem(userId: number, itemId: number, isDone: boolean) {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Checklist item not found");
    }
    if (item.user_id !== userId) {
      throw new ForbiddenException("You cannot update this item");
    }

    item.is_done = isDone;
    item.done_at = isDone ? new Date() : null;
    const saved = await this.itemRepo.save(item);

    const connection = await this.connectionRepo.findOne({
      where: { user_id: userId },
    });

    if (connection) {
      try {
        const redirectUri = await this.gmailService.getStoredRedirectUri();
        await this.ensureFreshTokens(connection, redirectUri);
        await this.gmailService.setMessageReadState(
          connection,
          item.gmail_message_id,
          isDone,
          redirectUri,
        );
      } catch (error: any) {
        this.logger.warn(
          `Gmail read-state update failed for user ${userId}: ${error?.message}`,
        );
      }
    }

    return saved;
  }

  async syncUserInbox(userId: number, redirectUri?: string): Promise<number> {
    const connection = await this.connectionRepo.findOne({
      where: { user_id: userId },
    });

    if (!connection) {
      throw new BadRequestException("Gmail is not connected");
    }

    return this.syncConnection(connection, redirectUri);
  }

  async syncAllConnectedUsers(): Promise<number> {
    const connections = await this.connectionRepo.find();
    let totalNew = 0;

    for (const connection of connections) {
      try {
        totalNew += await this.syncConnection(connection);
      } catch (error: any) {
        this.logger.error(
          `Email checklist sync failed for user ${connection.user_id}: ${error?.message}`,
        );
      }
    }

    return totalNew;
  }

  private async ensureFreshTokens(
    connection: GmailConnection,
    redirectUri: string,
  ) {
    const refreshed = await this.gmailService.refreshTokensIfNeeded(
      connection,
      redirectUri,
    );
    if (!refreshed) return;

    connection.access_token = refreshed.accessToken;
    connection.token_expiry = refreshed.tokenExpiry;
    await this.connectionRepo.save(connection);
  }

  private async resolveRedirectUri(redirectUri?: string): Promise<string> {
    if (redirectUri?.trim()) {
      return redirectUri.trim();
    }
    return this.gmailService.getStoredRedirectUri();
  }

  private async syncConnection(
    connection: GmailConnection,
    redirectUri?: string,
  ): Promise<number> {
    if (!connection.inbox_sync_from) {
      connection.inbox_sync_from = new Date();
      await this.connectionRepo.save(connection);
    }

    const resolvedRedirectUri = await this.resolveRedirectUri(redirectUri);
    const syncFrom = connection.inbox_sync_from;
    await this.ensureFreshTokens(connection, resolvedRedirectUri);

    const messages = await this.gmailService.fetchUnreadMessages(
      connection,
      resolvedRedirectUri,
      syncFrom,
    );
    let newCount = 0;

    for (const message of messages) {
      if (!message.id) continue;

      const exists = await this.itemRepo.findOne({
        where: {
          user_id: connection.user_id,
          gmail_message_id: message.id,
        },
      });

      if (exists) continue;

      if (
        message.receivedAt &&
        message.receivedAt.getTime() < syncFrom.getTime()
      ) {
        continue;
      }

      await this.itemRepo.save(
        this.itemRepo.create({
          user_id: connection.user_id,
          gmail_message_id: message.id,
          subject: message.subject,
          email_from: message.from,
          received_at: message.receivedAt,
          is_done: false,
        }),
      );
      newCount += 1;
    }

    connection.last_synced_at = new Date();
    await this.connectionRepo.save(connection);
    return newCount;
  }
}
