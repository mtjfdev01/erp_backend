import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow all local dev and deployment origins
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  namespace: '/ws_chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(private readonly jwtService: JwtService) {}

  afterInit() {
    this.logger.log('Chat WebSocket Gateway initialized on /ws_chat');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.query?.token as string) ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      let userId = client.handshake.auth?.userId || (client.handshake.query?.userId as string);

      if (token) {
        try {
          const payload = await this.jwtService.verifyAsync(token, {
            secret: process.env.JWT_SECRET || 'your-secret-key',
          });
          if (payload?.id) {
            userId = String(payload.id);
          }
        } catch {
          // Token decode fallback
        }
      }

      if (userId) {
        client.data.userId = String(userId);
        if (!this.onlineUsers.has(userId)) {
          this.onlineUsers.set(userId, new Set());
        }
        this.onlineUsers.get(userId)!.add(client.id);

        /**
         * Real-time Room Routing:
         * Automatically join the user's dedicated personal room (`user_${userId}`).
         * This guarantees that when another colleague sends a message, this user receives
         * the real-time notification, message preview, and unread count badge even if
         * they currently have a different conversation open or are viewing the Chat List.
         */
        client.join(`user_${userId}`);
        this.logger.log(`Client ${client.id} joined personal room user_${userId}`);

        // Notify client and broadcast presence
        this.server.emit('user_presence', {
          userId,
          status: 'online',
          timestamp: new Date().toISOString(),
        });
      }

      client.emit('connected', {
        status: 'ok',
        socketId: client.id,
        onlineUsers: Array.from(this.onlineUsers.keys()),
      });
    } catch (e: any) {
      this.logger.warn(`Chat socket connection error: ${e?.message}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.onlineUsers.has(userId)) {
      const set = this.onlineUsers.get(userId)!;
      set.delete(client.id);
      if (set.size === 0) {
        this.onlineUsers.delete(userId);
        this.server.emit('user_presence', {
          userId,
          status: 'offline',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Client-side explicit personal room join.
   * Ensures that on reconnections or token refresh, the socket is joined
   * to `user_${userId}` so real-time unread count updates are never missed.
   */
  @SubscribeMessage('join_user')
  handleJoinUser(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    const uid = data?.userId ? String(data.userId) : client.data?.userId;
    if (uid) {
      client.join(`user_${uid}`);
      client.data.userId = String(uid);
      if (!this.onlineUsers.has(uid)) {
        this.onlineUsers.set(uid, new Set());
      }
      this.onlineUsers.get(uid)!.add(client.id);
      this.logger.log(`Client ${client.id} joined personal room user_${uid}`);
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    if (data?.conversationId) {
      client.join(data.conversationId);
    }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    if (data?.conversationId) {
      client.leave(data.conversationId);
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean; userId?: string }
  ) {
    const uid = data.userId || client.data?.userId;
    if (data?.conversationId && uid) {
      client.to(data.conversationId).emit('typing_indicator', {
        conversationId: data.conversationId,
        userId: uid,
        isTyping: data.isTyping,
      });
    }
  }

  // --- External broadcast helpers called by ChatService ---

  /**
   * Broadcasts a new message in real time with unread count updates.
   * 1. Targets the conversation room for participants currently inside the chat.
   * 2. Targets each participant's personal room (`user_${pid}`) so users looking at
   *    the Chat List or other conversations receive the message and unread badge.
   *    Note: Socket.IO chained `.to().to()` automatically deduplicates sockets.
   * 3. Emits `unread_count_updated` with database-persisted counts to each recipient.
   * 4. Emits `conversation_updated` with preview and unread counts across all active sessions.
   */
  broadcastNewMessage(
    conversationId: string,
    message: any,
    unreadCounts?: Record<string, number>,
    participantIds?: string[]
  ) {
    if (!this.server) return;

    // 1. Emit new_message to the conversation room and to each participant's room (deduplicated by Socket.IO)
    let broadcaster = this.server.to(conversationId);
    if (participantIds && participantIds.length > 0) {
      for (const pid of participantIds) {
        broadcaster = broadcaster.to(`user_${pid}`);
      }
    }
    broadcaster.emit('new_message', message);

    // 2. Emit unread_count_updated to each recipient
    if (participantIds && participantIds.length > 0 && unreadCounts) {
      for (const pid of participantIds) {
        const pStr = String(pid);
        const count = Number(unreadCounts[pStr] ?? unreadCounts[pid] ?? 0);
        this.server.to(`user_${pStr}`).emit('unread_count_updated', {
          conversationId,
          userId: pStr,
          unreadCount: count,
          unreadCounts,
        });
      }
    }

    // 3. Emit general conversation_updated
    this.server.emit('conversation_updated', {
      conversationId,
      lastMessage: message,
      unreadCounts: unreadCounts || {},
    });
  }

  /**
   * Broadcasts an unread count reset when a user opens/reads a conversation.
   * Emits to the user's personal room `user_${userId}` so other browser tabs
   * and devices belonging to this user instantly clear their unread badge.
   */
  broadcastUnreadCount(
    userId: string,
    conversationId: string,
    unreadCount: number,
    unreadCounts?: Record<string, number>
  ) {
    if (!this.server) return;

    const uStr = String(userId);
    this.server.to(`user_${uStr}`).emit('unread_count_updated', {
      conversationId,
      userId: uStr,
      unreadCount,
      unreadCounts: unreadCounts || { [uStr]: unreadCount },
    });

    this.server.emit('conversation_updated', {
      conversationId,
      unreadCounts: unreadCounts || { [uStr]: unreadCount },
    });
  }

  broadcastReceiptUpdate(
    conversationId: string,
    payload: { messageId?: string; status: string; userId: string; timestamp: string }
  ) {
    if (this.server) {
      this.server.to(conversationId).emit('receipt_update', payload);
      this.server.emit('receipt_update', payload);
    }
  }

  broadcastConversationUpdate(conversation: any) {
    if (this.server) {
      this.server.emit('conversation_saved', conversation);
    }
  }

  broadcastConversationDeleted(conversationId: string, participantIds?: string[]) {
    if (!this.server) return;
    let broadcaster = this.server.to(conversationId);
    if (participantIds && participantIds.length > 0) {
      for (const pid of participantIds) {
        broadcaster = broadcaster.to(`user_${pid}`);
      }
    }
    broadcaster.emit('conversation_deleted', { conversationId });
    this.server.emit('conversation_deleted', { conversationId });
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }
}
