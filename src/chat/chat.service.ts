import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { CreateChatMessageDto, ReactMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
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

  async getConversations(userId?: string): Promise<any[]> {
    const list = await this.conversationRepo.find({
      order: { updated_at: 'DESC' },
    });

    return list.map((c) => this.mapConversation(c));
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
    return this.mapConversation(saved);
  }

  // --- Messages ---

  async getAllMessages(limit: number = 2000): Promise<any[]> {
    const messages = await this.messageRepo.find({
      order: { created_at: 'ASC' },
      take: limit,
    });
    return messages.map((m) => this.mapMessage(m));
  }

  async getMessagesByChat(chatId: string, limit: number = 500): Promise<any[]> {
    const messages = await this.messageRepo.find({
      where: [{ chat_id: chatId }, { conversation_id: chatId }],
      order: { created_at: 'ASC' },
      take: limit,
    });
    return messages.map((m) => this.mapMessage(m));
  }

  async saveMessage(dto: CreateChatMessageDto, user?: any): Promise<any> {
    const nowIso = dto.timestamp || new Date().toISOString();
    const id = dto.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const senderId = dto.senderId || (user?.id ? String(user.id) : '5');
    const text = dto.text || (dto as any).content || '';
    const status = dto.status || (dto as any).deliveryStatus || 'delivered';
    const parentMsgId = dto.replyTo?.id || (dto as any).parentMessageId || null;
    const attachment = dto.attachment || ((dto as any).attachments?.[0] || null);
    const attachments = (dto as any).attachments || (dto.attachment ? [dto.attachment] : null);

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
    });

    const saved = await this.messageRepo.save(entity);

    // Update conversation last_message
    try {
      const conv = await this.conversationRepo.findOne({ where: { id: dto.chatId } });
      if (conv) {
        conv.last_message = {
          text: text || (dto.voiceDuration ? 'Voice message' : 'Shared an attachment'),
          timestamp: nowIso,
          senderId,
          type: dto.type || 'text',
        };
        await this.conversationRepo.save(conv);
      } else {
        const isTaskChat = dto.chatId.startsWith('task_chat_');
        const newConv = this.conversationRepo.create({
          id: dto.chatId,
          name: isTaskChat ? `Task Discussion (${dto.taskId || 'Linked'})` : 'Discussion',
          title: isTaskChat ? `Task Discussion (${dto.taskId || 'Linked'})` : 'Discussion',
          type: 'group',
          avatar_bg: 'bg-indigo-600',
          avatar_url: 'bg-indigo-600',
          participant_ids: [senderId],
          admin_ids: [senderId],
          department: null,
          department_id: null,
          created_by: senderId,
          is_readonly: false,
          linked_task_id: dto.taskId || dto.linkedTaskId || null,
          last_message: {
            text: text || 'Message sent',
            timestamp: nowIso,
            senderId,
            type: dto.type || 'text',
          },
        });
        await this.conversationRepo.save(newConv);
      }
    } catch (cErr) {
      this.logger.warn(`Could not update last_message for chat ${dto.chatId}: ${cErr}`);
    }

    return this.mapMessage(saved);
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
    return this.mapMessage(saved);
  }

  async markMessageRead(messageId: string): Promise<any> {
    await this.messageRepo.update({ id: messageId }, { status: 'read', delivery_status: 'read' });
    const updated = await this.messageRepo.findOne({ where: { id: messageId } });
    return updated ? this.mapMessage(updated) : null;
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
    };
  }
}
