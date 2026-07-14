import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { google, gmail_v1 } from "googleapis";
import { GmailConnection } from "./entities/gmail-connection.entity";
import { GmailOAuthAppConfig } from "./entities/gmail-oauth-app-config.entity";
import { buildUnreadSinceQuery } from "./gmail-query.util";

export type ParsedGmailMessage = {
  id: string;
  subject: string;
  from: string;
  receivedAt: Date | null;
};

const APP_CONFIG_ID = 1;

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(GmailOAuthAppConfig)
    private readonly appConfigRepo: Repository<GmailOAuthAppConfig>,
  ) {}

  async isAppConfigured(): Promise<boolean> {
    const row = await this.appConfigRepo.findOne({
      where: { id: APP_CONFIG_ID },
    });
    return !!(row?.client_id && row?.client_secret);
  }

  async getAppConfigPublic(redirectUri: string) {
    const row = await this.appConfigRepo.findOne({
      where: { id: APP_CONFIG_ID },
    });
    return {
      configured: !!(row?.client_id && row?.client_secret),
      client_id: row?.client_id || "",
      redirect_uri: redirectUri,
      has_client_secret: !!row?.client_secret,
    };
  }

  async saveAppConfig(
    clientId: string,
    redirectUri: string,
    clientSecret?: string,
  ) {
    const existing = await this.appConfigRepo.findOne({
      where: { id: APP_CONFIG_ID },
    });

    const secret = clientSecret?.trim() || existing?.client_secret || "";
    if (!secret) {
      throw new Error("Client secret is required on first setup.");
    }

    if (existing) {
      existing.client_id = clientId.trim();
      existing.client_secret = secret;
      existing.redirect_uri = redirectUri;
      await this.appConfigRepo.save(existing);
      return;
    }

    await this.appConfigRepo.save(
      this.appConfigRepo.create({
        id: APP_CONFIG_ID,
        client_id: clientId.trim(),
        client_secret: secret,
        redirect_uri: redirectUri,
      }),
    );
  }

  async getStoredRedirectUri(): Promise<string> {
    const row = await this.appConfigRepo.findOne({
      where: { id: APP_CONFIG_ID },
    });
    if (!row?.redirect_uri) {
      throw new Error("Google OAuth redirect URI is not configured.");
    }
    return row.redirect_uri;
  }

  private async getOAuthClient(redirectUri: string) {
    const row = await this.appConfigRepo.findOne({
      where: { id: APP_CONFIG_ID },
    });

    if (!row?.client_id || !row?.client_secret) {
      throw new Error(
        "Google sign-in is not enabled yet. Ask a super admin to complete the one-time setup on this page.",
      );
    }

    return new google.auth.OAuth2(
      row.client_id,
      row.client_secret,
      redirectUri,
    );
  }

  async getAuthUrl(
    userId: number,
    redirectUri: string,
    frontendUrl: string,
  ): Promise<string> {
    const oauth2Client = await this.getOAuthClient(redirectUri);
    const state = this.jwtService.sign(
      { sub: userId, purpose: "gmail_oauth", redirectUri, frontendUrl },
      { expiresIn: "15m" },
    );

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state,
    });
  }

  async exchangeCodeForTokens(
    code: string,
    state: string,
    fallbackRedirectUri: string,
  ) {
    const payload = await this.jwtService.verifyAsync<{
      sub: number;
      purpose: string;
      redirectUri?: string;
      frontendUrl?: string;
    }>(state);

    if (!payload?.sub || payload.purpose !== "gmail_oauth") {
      throw new Error("Invalid OAuth state");
    }

    const redirectUri = payload.redirectUri || fallbackRedirectUri;
    const oauth2Client = await this.getOAuthClient(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Google did not return the required tokens");
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const profile = await oauth2.userinfo.get();
    const gmailEmail = profile.data.email;

    if (!gmailEmail) {
      throw new Error("Could not read Gmail account email");
    }

    return {
      userId: Number(payload.sub),
      gmailEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      frontendUrl: payload.frontendUrl,
    };
  }

  private async getGmailClient(
    connection: GmailConnection,
    redirectUri: string,
  ) {
    const oauth2Client = await this.getOAuthClient(redirectUri);
    oauth2Client.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      expiry_date: connection.token_expiry
        ? connection.token_expiry.getTime()
        : undefined,
    });

    return {
      gmail: google.gmail({ version: "v1", auth: oauth2Client }),
      oauth2Client,
    };
  }

  async refreshTokensIfNeeded(
    connection: GmailConnection,
    redirectUri: string,
  ): Promise<{ accessToken: string; tokenExpiry: Date | null } | null> {
    const { oauth2Client } = await this.getGmailClient(connection, redirectUri);
    const isExpired =
      !connection.token_expiry ||
      connection.token_expiry.getTime() <= Date.now() + 60_000;

    if (!isExpired && oauth2Client.credentials.access_token) {
      return null;
    }

    const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
    if (!refreshed.access_token) {
      throw new Error("Failed to refresh Gmail access token");
    }

    return {
      accessToken: refreshed.access_token,
      tokenExpiry: refreshed.expiry_date
        ? new Date(refreshed.expiry_date)
        : null,
    };
  }

  private parseMessage(message: gmail_v1.Schema$Message): ParsedGmailMessage {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value || "";

    const subject = getHeader("Subject") || "(No subject)";
    const from = getHeader("From") || "";
    const dateHeader = getHeader("Date");
    const receivedAt = dateHeader ? new Date(dateHeader) : null;

    return {
      id: message.id || "",
      subject,
      from,
      receivedAt:
        receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : null,
    };
  }

  async fetchUnreadMessages(
    connection: GmailConnection,
    redirectUri: string,
    syncFrom: Date,
    maxResults = 50,
  ): Promise<ParsedGmailMessage[]> {
    try {
      const { gmail } = await this.getGmailClient(connection, redirectUri);
      const q = buildUnreadSinceQuery(syncFrom);
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults,
      });

      const messageIds = listRes.data.messages || [];
      if (messageIds.length === 0) {
        return [];
      }

      const parsed: ParsedGmailMessage[] = [];
      const syncFromMs = syncFrom.getTime();

      for (const item of messageIds) {
        if (!item.id) continue;
        try {
          const msgRes = await gmail.users.messages.get({
            userId: "me",
            id: item.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });
          const message = this.parseMessage(msgRes.data);
          if (
            message.receivedAt &&
            message.receivedAt.getTime() < syncFromMs
          ) {
            continue;
          }
          parsed.push(message);
        } catch (error: any) {
          this.logger.warn(
            `Failed to fetch Gmail message ${item.id}: ${error?.message}`,
          );
        }
      }

      return parsed;
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.error?.message ||
        error?.errors?.[0]?.message ||
        error?.message;
      this.logger.error(`Gmail fetch unread failed: ${apiMessage}`);
      throw new Error(apiMessage || "Failed to fetch unread Gmail messages");
    }
  }

  async setMessageReadState(
    connection: GmailConnection,
    messageId: string,
    isRead: boolean,
    redirectUri: string,
  ): Promise<void> {
    const { gmail } = await this.getGmailClient(connection, redirectUri);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: isRead
        ? { removeLabelIds: ["UNREAD"] }
        : { addLabelIds: ["UNREAD"] },
    });
  }
}
