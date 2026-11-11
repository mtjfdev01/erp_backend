import { Injectable, Logger, OnModuleInit, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { UserE2eeKeyEntity } from './entities/user-e2ee-key.entity';
import { ConversationKeyBundleEntity } from './entities/conversation-key-bundle.entity';
import { CreateChatMessageDto, ReactMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  // In-memory cache for fast sub-millisecond retrieval with mutation-based invalidation
  private conversationsCache = new Map<string, { data: any[]; expiresAt: number }>();
  private keysCache = new Map<string, { data: string; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 15000; // 15 seconds

  public invalidateCache(userId?: string) {
    if (userId) {
      this.conversationsCache.delete(userId);
    } else {
      this.conversationsCache.clear();
    }
  }

  async getChatUsers(): Promise<any[]> {
    try {
      const rawUsers = await this.messageRepo.manager.query(
        'SELECT id, first_name, last_name, email, role, department, phone, manager_id, "isActive" FROM "user" WHERE "is_archived" = false OR "is_archived" IS NULL ORDER BY id ASC'
      );
      return rawUsers;
    } catch (err) {
      this.logger.warn('Could not fetch chat users: ' + err);
      return [];
    }
  }

  async getDepartments(): Promise<string[]> {
    try {
      const adminModule = await import('../utils/admin');
      if (Array.isArray(adminModule.departments) && adminModule.departments.length > 0) {
        return adminModule.departments;
      }
    } catch {}

    return [
      'admin',
      'store',
      'procurements',
      'accounts_and_finance',
      'program',
      'it',
      'hr',
      'marketing',
      'audio_video',
      'fund_raising',
      'meal',
      'health',
      'executive_office',
      'ceo',
      'internal_audit',
      'crd',
      'aas_lab',
    ];
  }

  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(UserE2eeKeyEntity)
    private readonly userKeyRepo: Repository<UserE2eeKeyEntity>,
    @InjectRepository(ConversationKeyBundleEntity)
    private readonly keyBundleRepo: Repository<ConversationKeyBundleEntity>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  async onModuleInit() {
    await this.ensureInitialChannels();
  }

  /**
   * Ensure default organizational channels exist in database
   */
  private async ensureInitialChannels() {
    try {
      const count = await this.conversationRepo.count();
      if (count === 0) {
        this.logger.log('Seeding initial departmental communication channels in task_db...');
        const initialChannels: Partial<ConversationEntity>[] = [
          {
            id: 'chat_dept_program',
            name: 'Program & Operations',
            title: 'Program & Operations',
            type: 'channel',
            avatar_bg: 'bg-emerald-600',
            avatar_url: 'bg-emerald-600',
            participant_ids: ['3', '6', '5'],
            admin_ids: ['6'],
            department: 'program',
            department_id: 'program',
            created_by: '6',
            is_readonly: false,
            is_pinned: true,
            description: 'Official department channel for MTJF Program, Operations & Field Work.',
            last_message: {
              text: 'Field team update: All task deliverables for the current cycle are on schedule.',
              timestamp: new Date().toISOString(),
              senderId: '6',
              type: 'text',
            },
            unread_counts: { '5': 0, '3': 0 },
          },
          {
            id: 'chat_dept_admin',
            name: 'Executive Administration',
            title: 'Executive Administration',
            type: 'channel',
            avatar_bg: 'bg-slate-700',
            avatar_url: 'bg-slate-700',
            participant_ids: ['5', '6', '4', '2', '1', '3'],
            admin_ids: ['5'],
            department: 'admin',
            department_id: 'admin',
            created_by: '5',
            is_readonly: false,
            is_pinned: true,
            description: 'Central announcements & cross-departmental coordination.',
            last_message: {
              text: 'Please ensure all monthly procurement audits and task time logs are submitted.',
              timestamp: new Date().toISOString(),
              senderId: '5',
              type: 'text',
            },
            unread_counts: { '1': 0, '2': 0, '3': 0 },
          },
          {
            id: 'chat_dept_store',
            name: 'Store & Warehouse Operations',
            title: 'Store & Warehouse Operations',
            type: 'channel',
            avatar_bg: 'bg-cyan-600',
            avatar_url: 'bg-cyan-600',
            participant_ids: ['1', '2', '5'],
            admin_ids: ['2'],
            department: 'store',
            department_id: 'store',
            created_by: '2',
            is_readonly: false,
            description: 'Inventory, supplies dispatch, and warehouse logistics.',
            last_message: {
              text: 'Verification of stock inventory completed. Updating task proof.',
              timestamp: new Date().toISOString(),
              senderId: '1',
              type: 'text',
            },
            unread_counts: { '5': 0 },
          },
          {
            id: 'chat_dept_finance',
            name: 'Accounts & Finance',
            title: 'Accounts & Finance',
            type: 'channel',
            avatar_bg: 'bg-amber-600',
            avatar_url: 'bg-amber-600',
            participant_ids: ['4', '5'],
            admin_ids: ['4'],
            department: 'accounts_and_finance',
            department_id: 'accounts_and_finance',
            created_by: '4',
            is_readonly: false,
            description: 'Disbursements, donations accounting, and vendor invoices.',
            last_message: {
              text: 'Monthly reconciliation statement prepared. Task card attached.',
              timestamp: new Date().toISOString(),
              senderId: '4',
              type: 'text',
            },
            unread_counts: { '5': 0 },
          },
          {
            id: 'chat_direct_admin_manager',
            name: 'Raza Ali (Program Manager)',
            title: 'Raza Ali (Program Manager)',
            type: 'direct',
            avatar_bg: 'bg-purple-600',
            avatar_url: 'bg-purple-600',
            participant_ids: ['5', '6'],
            admin_ids: ['5', '6'],
            department: 'program',
            department_id: 'program',
            created_by: '5',
            is_readonly: false,
            last_message: {
              text: 'Assalam-o-Alaikum Sir, reviewed the latest task allocations in DMS.',
              timestamp: new Date().toISOString(),
              senderId: '6',
              type: 'text',
            },
            unread_counts: { '5': 0 },
          },
        ];

        for (const ch of initialChannels) {
          const entity = this.conversationRepo.create(ch);
          await this.conversationRepo.save(entity);
        }
        this.logger.log('Initial departmental communication channels seeded successfully.');
      }
    } catch (err) {
      this.logger.error('Failed to initialize chat channels:', err);
    }
  }

  // --- Conversations ---

  async getConversations(userId?: string, forceRefresh: boolean = false): Promise<any[]> {
    const cacheKey = userId ? String(userId) : '__all__';
    if (!forceRefresh) {
      const cached = this.conversationsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    const qb = this.conversationRepo
      .createQueryBuilder('c')
      .select([
        'c.id',
        'c.name',
        'c.title',
        'c.type',
        'c.avatar_bg',
        'c.avatar_url',
        'c.participant_ids',
        'c.admin_ids',
        'c.department',
        'c.department_id',
        'c.created_by',
        'c.is_readonly',
        'c.linked_task_id',
        'c.is_pinned',
        'c.description',
        'c.last_message',
        'c.unread_counts',
        'c.updated_at',
        'c.created_at',
      ])
      .orderBy('c.updated_at', 'DESC');

    const list = await qb.getMany();

    let result: any[];
    if (!userId) {
      result = list
        .filter((c) => {
          const isChannelOrAnnouncement = c.type === 'channel' || c.type === 'announcement';
          const hasMessages = Boolean(c.last_message && (c.last_message.text || c.last_message.type));
          return isChannelOrAnnouncement || hasMessages || Boolean(c.linked_task_id);
        })
        .map((c) => this.mapConversation(c));
    } else {
      const uid = String(userId);
      const authorized = list.filter((c) => {
        // Conversation has had at least one message exchanged
        const hasMessages = Boolean(c.last_message && (c.last_message.text || c.last_message.type));

        // 1. Direct 1:1 chats: user MUST be an explicit participant AND must have at least one message
        if (c.type === 'direct') {
          return (
            Array.isArray(c.participant_ids) &&
            c.participant_ids.map(String).includes(uid) &&
            hasMessages
          );
        }
        // 2. Group / Task chats: user must be in participant_ids or admin_ids AND (has messages or linked task)
        if (c.type === 'group') {
          const inParticipants = Array.isArray(c.participant_ids) && c.participant_ids.map(String).includes(uid);
          const inAdmins = Array.isArray(c.admin_ids) && c.admin_ids.map(String).includes(uid);
          const isLinkedTask = Boolean(c.linked_task_id);
          return (inParticipants || inAdmins) && (hasMessages || isLinkedTask);
        }
        // 3. Departmental channels / announcements:
        if (c.type === 'channel' || c.type === 'announcement') {
          if (!c.participant_ids || c.participant_ids.length === 0) return true;
          return c.participant_ids.map(String).includes(uid);
        }
        return Array.isArray(c.participant_ids) && c.participant_ids.map(String).includes(uid) && hasMessages;
      });
      result = authorized.map((c) => this.mapConversation(c));
    }

    this.conversationsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return result;
  }

  async saveConversation(dto: CreateConversationDto, user?: any): Promise<any> {
    const id = dto.id || 'chat_' + Date.now();
    let existing = await this.conversationRepo.findOne({ where: { id } });

    const name = dto.name || (dto as any).title || 'New Conversation';
    const title = name;
    const avatarBg = dto.avatarBg || (dto as any).avatarUrl || 'bg-indigo-600';
    const dept = dto.department || (dto as any).departmentId || null;
    const isReadonly = Boolean((dto as any).isReadOnly || (dto as any).is_readonly);
    const createdBy = user ? String(user.id) : (dto.adminIds?.[0] || '5');

    if (!existing) {
      existing = this.conversationRepo.create({
        id,
        name,
        title,
        type: dto.type || 'group',
        avatar_bg: avatarBg,
        avatar_url: avatarBg,
        participant_ids: dto.participantIds || (user ? [String(user.id)] : []),
        admin_ids: dto.adminIds || (user ? [String(user.id)] : []),
        department: dept,
        department_id: dept,
        created_by: createdBy,
        is_readonly: isReadonly,
        linked_task_id: dto.linkedTaskId || null,
        is_pinned: dto.isPinned ?? false,
        description: dto.description || null,
        last_message: dto.lastMessage || null,
        unread_counts: dto.unreadCounts || {},
      });
    } else {
      if (dto.name || (dto as any).title) {
        existing.name = name;
        existing.title = title;
      }
      if (dto.type) existing.type = dto.type;
      if (dto.avatarBg || (dto as any).avatarUrl) {
        existing.avatar_bg = avatarBg;
        existing.avatar_url = avatarBg;
      }
      if (dto.participantIds) existing.participant_ids = dto.participantIds;
      if (dto.adminIds) existing.admin_ids = dto.adminIds;
      if (dto.department !== undefined || (dto as any).departmentId !== undefined) {
        existing.department = dept;
        existing.department_id = dept;
      }
      if (dto.linkedTaskId !== undefined) existing.linked_task_id = dto.linkedTaskId;
      if (dto.isPinned !== undefined) existing.is_pinned = dto.isPinned;
      if (dto.description !== undefined) existing.description = dto.description;
      if (dto.lastMessage) existing.last_message = dto.lastMessage;
      if (dto.unreadCounts) existing.unread_counts = dto.unreadCounts;
      if ((dto as any).isReadOnly !== undefined || (dto as any).is_readonly !== undefined) {
        existing.is_readonly = isReadonly;
      }
    }

    const saved = await this.conversationRepo.save(existing);
    const mapped = this.mapConversation(saved);
    this.invalidateCache();

    // Only broadcast over Socket.IO if the conversation has a message or is a channel/announcement.
    // Selecting a user or creating an empty conversation must NEVER broadcast or show in the recipient's Chat List.
    const shouldBroadcast =
      Boolean(saved.last_message && (saved.last_message.text || saved.last_message.type)) ||
      saved.type === 'channel' ||
      saved.type === 'announcement';

    if (shouldBroadcast) {
      this.chatGateway.broadcastConversationUpdate(mapped);
    }
    return mapped;
  }

  async deleteConversation(id: string, userId?: string): Promise<{ success: boolean; id: string }> {
    const conv = await this.conversationRepo.findOne({ where: { id } });
    if (!conv) {
      // If already deleted in database, still ensure cache and sockets are invalidated
      this.invalidateCache();
      this.chatGateway.broadcastConversationDeleted(id);
      return { success: true, id };
    }

    const pids = (conv.participant_ids || []).map(String);

    // Delete associated messages, key bundles, and the conversation entity
    await this.messageRepo.delete({ chat_id: id });
    await this.keyBundleRepo.delete({ conversation_id: id });
    await this.conversationRepo.delete({ id });

    // Invalidate in-memory cache so subsequent fetches hit fresh database state
    this.invalidateCache();

    // Broadcast deletion over Socket.IO to all participants and connected tabs
    this.chatGateway.broadcastConversationDeleted(id, pids);

    this.logger.log(`Conversation ${id} deleted by user ${userId || 'system'}`);
    return { success: true, id };
  }

  // --- Messages ---

  async getAllMessages(userId?: string, limit: number = 2000): Promise<any[]> {
    if (userId) {
      // Find all conversations where userId is an authorized participant
      const allConvs = await this.conversationRepo.find();
      const authorizedChatIds = allConvs
        .filter(
          (c) =>
            !c.participant_ids ||
            c.participant_ids.length === 0 ||
            c.participant_ids.includes(String(userId)) ||
            c.type === 'channel'
        )
        .map((c) => c.id);

      if (authorizedChatIds.length === 0) {
        return [];
      }

      const messages = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.chat_id IN (:...authorizedChatIds) OR m.conversation_id IN (:...authorizedChatIds)', {
          authorizedChatIds,
        })
        .orderBy('m.created_at', 'ASC')
        .take(limit)
        .getMany();

      // Automatically mark messages delivered to this user
      const nowIso = new Date().toISOString();
      const updatedMessagesToSave: ChatMessageEntity[] = [];
      for (const msg of messages) {
        if (String(msg.sender_id) === String(userId)) continue;
        const deliveredTo = msg.delivered_to || {};
        if (!deliveredTo[userId]) {
          deliveredTo[userId] = nowIso;
          msg.delivered_to = deliveredTo;
          if (msg.status === 'sent') {
            msg.status = 'delivered';
            msg.delivery_status = 'delivered';
          }
          updatedMessagesToSave.push(msg);
        }
      }
      if (updatedMessagesToSave.length > 0) {
        this.messageRepo.save(updatedMessagesToSave).catch((err) => {
          this.logger.warn(`Could not save auto-delivered statuses: ${err}`);
        });
      }

      return messages.map((m) => this.mapMessage(m));
    }

    const messages = await this.messageRepo.find({
      order: { created_at: 'ASC' },
      take: limit,
    });
    return messages.map((m) => this.mapMessage(m));
  }

  async getMessagesByChat(
    chatId: string,
    userId?: string,
    limit: number = 50,
    before?: string
  ): Promise<any[]> {
    if (userId) {
      const conv = await this.conversationRepo
        .createQueryBuilder('c')
        .select(['c.id', 'c.type', 'c.participant_ids'])
        .where('c.id = :id', { id: chatId })
        .getOne();

      if (
        conv &&
        conv.type !== 'channel' &&
        conv.participant_ids &&
        conv.participant_ids.length > 0 &&
        !conv.participant_ids.includes(String(userId))
      ) {
        throw new ForbiddenException('Access denied. You are not an authorized participant of this conversation.');
      }
      this.markConversationDelivered(chatId, userId).catch(() => {});
    }

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .select([
        'm.id',
        'm.chat_id',
        'm.conversation_id',
        'm.sender_id',
        'm.text',
        'm.content',
        'm.type',
        'm.status',
        'm.delivery_status',
        'm.timestamp',
        'm.created_at',
        'm.read_at',
        'm.read_by',
        'm.delivered_to',
        'm.reply_to',
        'm.parent_message_id',
        'm.attachment',
        'm.attachments',
        'm.voice_duration',
        'm.task_id',
        'm.linked_task_id',
        'm.mentions',
        'm.reactions',
        'm.is_edited',
        'm.is_deleted',
        'm.is_encrypted',
        'm.key_version',
      ])
      .where('(m.chat_id = :chatId OR m.conversation_id = :chatId)', { chatId });

    if (before) {
      qb.andWhere('m.created_at < :before', { before: new Date(before) });
    }

    const messages = await qb
      .orderBy('m.created_at', 'DESC')
      .take(limit)
      .getMany();

    // Reverse to chronological order (oldest to newest)
    messages.reverse();
    return messages.map((m) => this.mapMessage(m));
  }

  async saveMessage(dto: CreateChatMessageDto, user?: any): Promise<any> {
    const nowIso = dto.timestamp || new Date().toISOString();
    const id = dto.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const senderId = dto.senderId || (user?.id ? String(user.id) : '5');
    const text = dto.text || (dto as any).content || '';
    const status = dto.status || (dto as any).deliveryStatus || 'sent';
    const parentMsgId = dto.replyTo?.id || (dto as any).parentMessageId || null;
    const attachment = dto.attachment || ((dto as any).attachments?.[0] || null);
    const attachments = (dto as any).attachments || (dto.attachment ? [dto.attachment] : null);
    const isEncrypted = Boolean(
      (dto as any).isEncrypted ||
      (text && text.startsWith('e2ee:v1:'))
    );
    const keyVersion = (dto as any).keyVersion || 1;

    const entity = this.messageRepo.create({
      id,
      chat_id: dto.chatId,
      conversation_id: dto.chatId,
      sender_id: senderId,
      text,
      content: text,
      type: dto.type || 'text',
      status,
      delivery_status: status,
      timestamp: nowIso,
      reply_to: dto.replyTo || null,
      parent_message_id: parentMsgId,
      attachment,
      attachments,
      voice_duration: dto.voiceDuration ?? null,
      task_id: dto.taskId || null,
      linked_task_id: dto.linkedTaskId || null,
      mentions: dto.mentions || null,
      reactions: dto.reactions || [],
      is_edited: false,
      is_deleted: false,
      is_encrypted: isEncrypted,
      key_version: keyVersion,
      delivered_to: {},
      read_by: {},
    });

    const saved = await this.messageRepo.save(entity);

    // Update conversation last_message & increment unread_counts for recipients
    const displaySnippet = isEncrypted
      ? '🔒 End-to-end encrypted message'
      : (text || (dto.voiceDuration ? 'Voice message' : 'Shared an attachment'));

    /**
     * Update conversation metadata and recipient unread counts in PostgreSQL.
     * Rule 1: Only increment unread count for other participants (never for the sender).
     * Rule 2: Pass updated unread counts to the gateway for targeted real-time delivery.
     */
    let unreadCountsPayload: Record<string, number> = {};
    let participantIdsPayload: string[] = [];

    try {
      const conv = await this.conversationRepo.findOne({ where: { id: dto.chatId } });
      if (conv) {
        conv.last_message = {
          text: displaySnippet,
          timestamp: nowIso,
          senderId,
          type: dto.type || 'text',
          status,
        };
        const currentUnread = conv.unread_counts || {};
        const participants = (conv.participant_ids || []).map(String);
        for (const p of participants) {
          if (String(p) !== String(senderId)) {
            const current = Number(currentUnread[p] ?? currentUnread[Number(p)] ?? 0);
            currentUnread[p] = current + 1;
          }
        }
        conv.unread_counts = currentUnread;
        unreadCountsPayload = currentUnread;
        participantIdsPayload = participants;
        await this.conversationRepo.save(conv);

        // Broadcast conversation update so both sender and recipient Chat Lists show latest message & timestamp
        const mappedConv = this.mapConversation(conv);
        this.chatGateway.broadcastConversationUpdate(mappedConv);
      } else {
        const isTaskChat = dto.chatId.startsWith('task_chat_');
        const participants = Array.isArray((dto as any).participantIds) && (dto as any).participantIds.length > 0
          ? [...new Set([String(senderId), ...(dto as any).participantIds.map(String)])]
          : [String(senderId)];
        participantIdsPayload = participants;
        const initialUnread: Record<string, number> = {};
        for (const p of participants) {
          if (String(p) !== String(senderId)) {
            initialUnread[p] = 1;
          }
        }
        unreadCountsPayload = initialUnread;
        const newConv = this.conversationRepo.create({
          id: dto.chatId,
          name: (dto as any).conversationName || (isTaskChat ? `Task Discussion (${dto.taskId || 'Linked'})` : 'Discussion'),
          title: (dto as any).conversationName || (isTaskChat ? `Task Discussion (${dto.taskId || 'Linked'})` : 'Discussion'),
          type: (dto as any).conversationType || (isTaskChat ? 'group' : 'direct'),
          avatar_bg: 'bg-indigo-600',
          avatar_url: 'bg-indigo-600',
          participant_ids: participants,
          admin_ids: [senderId],
          department: null,
          department_id: null,
          created_by: senderId,
          is_readonly: false,
          linked_task_id: dto.taskId || dto.linkedTaskId || null,
          last_message: {
            text: displaySnippet,
            timestamp: nowIso,
            senderId,
            type: dto.type || 'text',
            status,
          },
          unread_counts: initialUnread,
        });
        const savedNewConv = await this.conversationRepo.save(newConv);
        const mappedConv = this.mapConversation(savedNewConv);
        this.chatGateway.broadcastConversationUpdate(mappedConv);
      }
    } catch (cErr) {
      this.logger.warn(`Could not update last_message for chat ${dto.chatId}: ${cErr}`);
    }

    const mapped = this.mapMessage(saved);
    // Broadcast message and per-user unread counts to all participant personal rooms via Socket.IO
    this.chatGateway.broadcastNewMessage(dto.chatId, mapped, unreadCountsPayload, participantIdsPayload);
    this.invalidateCache();
    return mapped;
  }

  // --- E2EE Key Management ---

  async saveUserPublicKey(
    userId: string,
    publicKey: string,
    keyType: string = 'RSA-OAEP',
    encryptedPrivateKey?: string,
    keyDerivationSalt?: string,
  ): Promise<UserE2eeKeyEntity> {
    let keyRecord = await this.userKeyRepo.findOne({ where: { user_id: userId } });
    if (!keyRecord) {
      keyRecord = this.userKeyRepo.create({
        user_id: userId,
        public_key: publicKey,
        key_type: keyType,
        encrypted_private_key: encryptedPrivateKey,
        key_derivation_salt: keyDerivationSalt,
      });
    } else {
      keyRecord.public_key = publicKey;
      keyRecord.key_type = keyType;
      if (encryptedPrivateKey) {
        keyRecord.encrypted_private_key = encryptedPrivateKey;
      }
      if (keyDerivationSalt) {
        keyRecord.key_derivation_salt = keyDerivationSalt;
      }
    }
    const saved = await this.userKeyRepo.save(keyRecord);
    this.keysCache.delete(userId);
    return saved;
  }

  async getUserPublicKey(userId: string): Promise<UserE2eeKeyEntity | null> {
    return this.userKeyRepo.findOne({ where: { user_id: userId } });
  }

  async getUsersPublicKeys(userIds: string[]): Promise<Record<string, string>> {
    if (!userIds || userIds.length === 0) return {};
    const missingIds: string[] = [];
    const result: Record<string, string> = {};

    const now = Date.now();
    for (const id of userIds) {
      const cached = this.keysCache.get(id);
      if (cached && cached.expiresAt > now) {
        result[id] = cached.data;
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0) {
      const keys = await this.userKeyRepo.createQueryBuilder('k')
        .select(['k.user_id', 'k.public_key'])
        .where('k.user_id IN (:...missingIds)', { missingIds })
        .getMany();

      for (const k of keys) {
        result[k.user_id] = k.public_key;
        this.keysCache.set(k.user_id, {
          data: k.public_key,
          expiresAt: now + 60000,
        });
      }
    }
    return result;
  }

  async saveKeyBundle(
    conversationId: string,
    keyVersion: number,
    bundles: Array<{ userId: string; encryptedKey: string }>,
    createdBy: string,
  ): Promise<any[]> {
    const saved: ConversationKeyBundleEntity[] = [];
    for (const item of bundles) {
      let bundle = await this.keyBundleRepo.findOne({
        where: {
          conversation_id: conversationId,
          key_version: keyVersion,
          user_id: String(item.userId),
        },
      });
      if (!bundle) {
        bundle = this.keyBundleRepo.create({
          conversation_id: conversationId,
          key_version: keyVersion,
          user_id: String(item.userId),
          encrypted_key: item.encryptedKey,
          created_by: createdBy,
        });
      } else {
        bundle.encrypted_key = item.encryptedKey;
        bundle.created_by = createdBy;
      }
      saved.push(await this.keyBundleRepo.save(bundle));
    }
    return saved;
  }

  async getKeyBundleForUser(conversationId: string, userId: string, keyVersion?: number): Promise<any | null> {
    // 1. Authorization: verify user is in conversation participants if conversation is tracked
    const conv = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (conv && conv.participant_ids && conv.participant_ids.length > 0 && !conv.participant_ids.includes(String(userId))) {
      throw new ForbiddenException('Access denied. You are not a participant of this conversation.');
    }

    const whereClause: any = {
      conversation_id: conversationId,
      user_id: String(userId),
    };
    if (keyVersion) {
      whereClause.key_version = keyVersion;
    }

    const bundle = await this.keyBundleRepo.findOne({
      where: whereClause,
      order: { key_version: 'DESC' },
    });
    return bundle;
  }

  async getAllKeyBundlesForUser(userId: string): Promise<any[]> {
    const bundles = await this.keyBundleRepo.find({
      where: { user_id: String(userId) },
      order: { conversation_id: 'ASC', key_version: 'DESC' },
    });
    return bundles;
  }

  async reactToMessage(messageId: string, emoji: string, userId: string): Promise<any> {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const reactions = msg.reactions || [];
    const existing = reactions.find((r) => r.emoji === emoji);

    let updatedReactions;
    if (existing) {
      if (existing.userIds.includes(userId)) {
        const newUserIds = existing.userIds.filter((id) => id !== userId);
        if (newUserIds.length === 0) {
          updatedReactions = reactions.filter((r) => r.emoji !== emoji);
        } else {
          updatedReactions = reactions.map((r) =>
            r.emoji === emoji ? { ...r, userIds: newUserIds } : r
          );
        }
      } else {
        updatedReactions = reactions.map((r) =>
          r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r
        );
      }
    } else {
      updatedReactions = [...reactions, { emoji, userIds: [userId] }];
    }

    msg.reactions = updatedReactions;
    const saved = await this.messageRepo.save(msg);
    const mapped = this.mapMessage(saved);
    this.chatGateway.broadcastNewMessage(mapped.chatId, mapped);
    return mapped;
  }

  async markMessageRead(messageId: string, userId?: string): Promise<any> {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) return null;

    const nowIso = new Date().toISOString();
    const readBy = msg.read_by || {};
    const deliveredTo = msg.delivered_to || {};

    if (userId) {
      readBy[userId] = nowIso;
      deliveredTo[userId] = deliveredTo[userId] || nowIso;
      msg.read_by = readBy;
      msg.delivered_to = deliveredTo;
    }

    msg.status = 'read';
    msg.delivery_status = 'read';
    msg.read_at = new Date();
    const saved = await this.messageRepo.save(msg);
    const mapped = this.mapMessage(saved);
    this.chatGateway.broadcastReceiptUpdate(mapped.chatId, {
      messageId: mapped.id,
      status: 'read',
      userId: userId || String(msg.sender_id),
      timestamp: nowIso,
    });
    return mapped;
  }

  async markConversationDelivered(conversationId: string, userId: string): Promise<any> {
    if (!conversationId || !userId) return { success: false };

    const conv = await this.conversationRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.participant_ids', 'c.last_message'])
      .where('c.id = :id', { id: conversationId })
      .getOne();

    const participants = conv?.participant_ids || [];

    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('(m.chat_id = :cid OR m.conversation_id = :cid)', { cid: conversationId })
      .andWhere('m.sender_id != :uid', { uid: String(userId) })
      .getMany();

    const nowIso = new Date().toISOString();
    const toUpdate: ChatMessageEntity[] = [];

    for (const msg of messages) {
      const deliveredTo = msg.delivered_to || {};
      if (!deliveredTo[userId]) {
        deliveredTo[userId] = nowIso;
        msg.delivered_to = deliveredTo;

        const otherParticipants = participants.filter((p) => String(p) !== String(msg.sender_id));
        const allDelivered = otherParticipants.length === 0 || otherParticipants.every((p) => Boolean(deliveredTo[p]));

        if (allDelivered && msg.status !== 'read') {
          msg.status = 'delivered';
          msg.delivery_status = 'delivered';
        }
        toUpdate.push(msg);
      }
    }

    if (toUpdate.length > 0) {
      await this.messageRepo.save(toUpdate, { chunk: 100 });
    }

    if (conv && conv.last_message && String(conv.last_message.senderId) !== String(userId)) {
      if (conv.last_message.status !== 'read') {
        conv.last_message.status = 'delivered';
        await this.conversationRepo.save(conv);
      }
    }

    this.chatGateway.broadcastReceiptUpdate(conversationId, {
      status: 'delivered',
      userId,
      timestamp: nowIso,
    });

    return { success: true, conversationId, deliveredCount: toUpdate.length };
  }

  async markConversationRead(conversationId: string, userId: string): Promise<any> {
    if (!conversationId || !userId) return { success: false };

    const conv = await this.conversationRepo.findOne({ where: { id: conversationId } });
    const participants = conv?.participant_ids || [];

    /**
     * Reset unread message count for the viewing user in PostgreSQL.
     * Persisted so that page reloads or new logins reflect zero unread.
     */
    if (conv) {
      const unreadCounts = conv.unread_counts || {};
      unreadCounts[userId] = 0;
      unreadCounts[String(userId)] = 0;
      conv.unread_counts = unreadCounts;
      await this.conversationRepo.save(conv);
    }

    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('(m.chat_id = :cid OR m.conversation_id = :cid)', { cid: conversationId })
      .andWhere('m.sender_id != :uid', { uid: String(userId) })
      .getMany();

    const nowIso = new Date().toISOString();
    const nowDate = new Date();
    const toUpdate: ChatMessageEntity[] = [];

    for (const msg of messages) {
      const readBy = msg.read_by || {};
      const deliveredTo = msg.delivered_to || {};

      let changed = false;
      if (!deliveredTo[userId]) {
        deliveredTo[userId] = nowIso;
        msg.delivered_to = deliveredTo;
        changed = true;
      }

      if (!readBy[userId]) {
        readBy[userId] = nowIso;
        msg.read_by = readBy;
        changed = true;
      }

      const otherParticipants = participants.filter((p) => String(p) !== String(msg.sender_id));
      const allRead = otherParticipants.length === 0 || otherParticipants.every((p) => Boolean(readBy[p]));

      if (allRead) {
        if (msg.status !== 'read') {
          msg.status = 'read';
          msg.delivery_status = 'read';
          msg.read_at = nowDate;
          changed = true;
        }
      } else if (msg.status !== 'read') {
        msg.status = 'delivered';
        msg.delivery_status = 'delivered';
        changed = true;
      }

      if (changed) {
        toUpdate.push(msg);
      }
    }

    if (toUpdate.length > 0) {
      await this.messageRepo.save(toUpdate, { chunk: 100 });
    }

    if (conv) {
      if (conv.last_message && String(conv.last_message.senderId) !== String(userId)) {
        conv.last_message.status = 'read';
      }
      await this.conversationRepo.save(conv);
    }

    this.invalidateCache(userId);

    /**
     * Real-time Multi-Session Synchronization via Socket.IO:
     * 1. Broadcasts unread count reset (0) to this user's personal room `user_${userId}`
     *    so all active tabs/devices immediately clear their unread badge without refreshing.
     * 2. Broadcasts read receipt update (`read`) to conversation participants
     *    so the sender instantly sees double blue ticks.
     */
    this.chatGateway.broadcastUnreadCount(
      String(userId),
      conversationId,
      0,
      conv?.unread_counts || {}
    );

    this.chatGateway.broadcastReceiptUpdate(conversationId, {
      status: 'read',
      userId,
      timestamp: nowIso,
    });

    return { success: true, conversationId, readCount: toUpdate.length };
  }

  // --- Notifications in task_db ---

  async getNotifications(userId: number): Promise<any[]> {
    try {
      const rows = await this.messageRepo.manager.query(`
        SELECT 
          un.id,
          un.user_id,
          un.is_read,
          un.created_at,
          n.title,
          n.message,
          n.type,
          n.metadata
        FROM user_notifications un
        JOIN notifications n ON n.id = un.notification_id
        WHERE un.user_id = $1 AND un.is_archived = false
        ORDER BY un.created_at DESC
        LIMIT 100;
      `, [userId]);

      return rows.map((r: any) => ({
        id: String(r.id),
        recipientId: String(r.user_id),
        senderId: r.metadata?.senderId || 'system',
        type: r.metadata?.chatNotifType || (r.type === 'task' ? 'status_change' : 'mention'),
        title: r.title,
        body: r.message,
        timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        read: Boolean(r.is_read),
        chatId: r.metadata?.chatId || undefined,
        messageId: r.metadata?.messageId || undefined,
        taskId: r.metadata?.task_id ? String(r.metadata.task_id) : (r.metadata?.taskId ? String(r.metadata.taskId) : undefined),
      }));
    } catch (err: any) {
      this.logger.warn(`Failed to fetch notifications for user ${userId}: ${err?.message}`);
      return [];
    }
  }

  async createNotification(dto: any, user?: any): Promise<any> {
    const targetUserId = parseInt(dto.recipientId || dto.userId || '5', 10);
    const senderId = dto.senderId ? parseInt(dto.senderId, 10) : (user?.id ? user.id : 5);
    const title = dto.title || 'Notification';
    const message = dto.body || dto.message || '';
    const type = dto.type === 'mention' ? 'info' : (dto.type === 'new_task' ? 'task' : 'info');
    const metadata = {
      chatNotifType: dto.type,
      chatId: dto.chatId,
      messageId: dto.messageId,
      taskId: dto.taskId,
      senderId: dto.senderId,
    };

    const nRes = await this.messageRepo.manager.query(`
      INSERT INTO notifications (title, message, type, metadata, created_by, is_archived, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
      RETURNING id, created_at;
    `, [title, message, type, JSON.stringify(metadata), senderId]);

    const notifId = nRes[0].id;

    const unRes = await this.messageRepo.manager.query(`
      INSERT INTO user_notifications (user_id, notification_id, is_read, is_archived, created_at, updated_at)
      VALUES ($1, $2, false, false, NOW(), NOW())
      RETURNING id, created_at;
    `, [targetUserId, notifId]);

    return {
      id: String(unRes[0].id),
      recipientId: String(targetUserId),
      senderId: String(senderId),
      type: dto.type || 'mention',
      title,
      body: message,
      timestamp: unRes[0].created_at ? new Date(unRes[0].created_at).toISOString() : new Date().toISOString(),
      read: false,
      chatId: dto.chatId,
      messageId: dto.messageId,
      taskId: dto.taskId,
    };
  }

  async markNotificationRead(id: string | number): Promise<any> {
    const numId = parseInt(String(id), 10);
    if (!isNaN(numId)) {
      await this.messageRepo.manager.query(`
        UPDATE user_notifications
        SET is_read = true, read_at = NOW(), updated_at = NOW()
        WHERE id = $1;
      `, [numId]);
    }
    return { success: true };
  }

  async markAllNotificationsRead(userId: string | number): Promise<any> {
    const numId = parseInt(String(userId), 10);
    if (!isNaN(numId)) {
      await this.messageRepo.manager.query(`
        UPDATE user_notifications
        SET is_read = true, read_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND is_read = false;
      `, [numId]);
    }
    return { success: true };
  }

  // --- Mappers to CamelCase ---

  private mapConversation(entity: ConversationEntity): any {
    return {
      id: entity.id,
      name: entity.name,
      title: entity.title || entity.name,
      type: entity.type,
      avatarBg: entity.avatar_bg || 'bg-slate-700',
      avatarUrl: entity.avatar_url || entity.avatar_bg || undefined,
      participantIds: entity.participant_ids || [],
      adminIds: entity.admin_ids || [],
      department: entity.department || undefined,
      departmentId: entity.department_id || entity.department || undefined,
      createdBy: entity.created_by || undefined,
      isReadOnly: Boolean(entity.is_readonly),
      linkedTaskId: entity.linked_task_id || undefined,
      isPinned: entity.is_pinned,
      description: entity.description || undefined,
      lastMessage: entity.last_message || undefined,
      unreadCounts: entity.unread_counts || {},
    };
  }

  private mapMessage(entity: ChatMessageEntity): any {
    return {
      id: entity.id,
      chatId: entity.chat_id,
      conversationId: entity.conversation_id || entity.chat_id,
      senderId: entity.sender_id,
      text: entity.text,
      content: entity.content || entity.text,
      type: entity.type,
      status: entity.status,
      deliveryStatus: entity.delivery_status || entity.status,
      timestamp: entity.timestamp || entity.created_at.toISOString(),
      readAt: entity.read_at ? entity.read_at.toISOString() : undefined,
      readBy: entity.read_by || {},
      deliveredTo: entity.delivered_to || {},
      replyTo: entity.reply_to || undefined,
      parentMessageId: entity.parent_message_id || entity.reply_to?.id || undefined,
      attachment: entity.attachment || undefined,
      attachments: entity.attachments || (entity.attachment ? [entity.attachment] : []),
      voiceDuration: entity.voice_duration ?? undefined,
      taskId: entity.task_id || undefined,
      linkedTaskId: entity.linked_task_id || undefined,
      mentions: entity.mentions || undefined,
      reactions: entity.reactions || [],
      isEdited: Boolean(entity.is_edited),
      isDeleted: Boolean(entity.is_deleted),
      isEncrypted: Boolean(entity.is_encrypted),
      keyVersion: entity.key_version || 1,
    };
  }
}
