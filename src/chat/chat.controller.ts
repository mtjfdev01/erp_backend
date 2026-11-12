import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Req,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { CreateChatMessageDto, ReactMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ChatJwtGuard } from './guards/chat-jwt.guard';
import { TasksService } from '../tasks/tasks.service';
import { Optional, Inject, forwardRef } from '@nestjs/common';

@Controller('chat')
@UseGuards(ChatJwtGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    @Optional() @Inject(forwardRef(() => TasksService)) private readonly tasksService?: TasksService,
  ) {}

  
  @Get('users')
  async getChatUsers(@Res() res: Response) {
    try {
      const users = await this.chatService.getChatUsers();
      return res.status(HttpStatus.OK).json({
        success: true,
        data: users,
      });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err?.message || 'Failed to fetch team users',
        data: [],
      });
    }
  }

  @Get('departments')
  async getDepartments(@Res() res: Response) {
    try {
      const depts = await this.chatService.getDepartments();
      return res.status(HttpStatus.OK).json({
        success: true,
        data: depts,
      });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err?.message || 'Failed to fetch departments',
        data: [],
      });
    }
  }

  @Get('conversations')
  async getConversations(
    @Query('userId') queryUserId: string,
    @Query('nocache') noCache: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const activeUserId = (queryUserId && queryUserId.trim()) || (user?.id ? String(user.id) : undefined);
      const forceRefresh = noCache === 'true' || noCache === '1';
      const conversations = await this.chatService.getConversations(activeUserId, forceRefresh);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: conversations,
      });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err?.message || 'Failed to fetch conversations',
        data: [],
      });
    }
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const result = await this.chatService.deleteConversation(id, user?.id ? String(user.id) : undefined);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to delete conversation',
      });
    }
  }

  @Post('conversations')
  async saveConversation(
    @Body() dto: CreateConversationDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const result = await this.chatService.saveConversation(dto, user);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to create conversation',
      });
    }
  }

  @Get('messages')
  async getAllMessages(
    @Query('limit') limitStr: string,
    @Query('userId') queryUserId: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const activeUserId = (queryUserId && queryUserId.trim()) || (user?.id ? String(user.id) : undefined);
      const limit = limitStr ? parseInt(limitStr, 10) : 2000;
      const messages = await this.chatService.getAllMessages(
        activeUserId,
        limit
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        data: messages,
      });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err?.message || 'Failed to fetch messages',
        data: [],
      });
    }
  }

  @Get('messages/:chatId')
  async getMessagesByChat(
    @Param('chatId') chatId: string,
    @Query('limit') limitStr: string,
    @Query('before') before: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      const messages = await this.chatService.getMessagesByChat(
        chatId,
        user?.id ? String(user.id) : undefined,
        limit,
        before
      );
      return res.status(HttpStatus.OK).json({
        success: true,
        data: messages,
      });
    } catch (err: any) {
      const status = err?.status || (err?.message?.includes('Access denied') ? HttpStatus.FORBIDDEN : HttpStatus.INTERNAL_SERVER_ERROR);
      return res.status(status).json({
        success: false,
        message: err?.message || 'Failed to fetch messages for chat',
        data: [],
      });
    }
  }

  // --- E2EE Cryptographic Key Management Endpoints ---

  @Post('keys/identity')
  async publishIdentityKey(
    @Body() body: { userId?: string; publicKey: string; keyType?: string; encryptedPrivateKey?: string; salt?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const userId = body.userId ? String(body.userId) : (user?.id ? String(user.id) : null);
      if (!userId) {
        return res.status(HttpStatus.UNAUTHORIZED).json({ success: false, message: 'User not authenticated' });
      }
      const saved = await this.chatService.saveUserPublicKey(
        userId,
        body.publicKey,
        body.keyType || 'RSA-OAEP',
        body.encryptedPrivateKey,
        body.salt
      );
      return res.status(HttpStatus.OK).json({ success: true, data: saved });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Get('keys/identity/:userId')
  async getUserIdentityKey(@Param('userId') targetUserId: string, @Res() res: Response) {
    try {
      const key = await this.chatService.getUserPublicKey(targetUserId);
      return res.status(HttpStatus.OK).json({ success: true, data: key });
    } catch (err: any) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: err?.message });
    }
  }

  @Post('keys/identities')
  async getUsersIdentityKeys(@Body() body: { userIds: string[] }, @Res() res: Response) {
    try {
      const keys = await this.chatService.getUsersPublicKeys(body.userIds || []);
      return res.status(HttpStatus.OK).json({ success: true, data: keys });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Post('keys/bundle')
  async saveKeyBundle(
    @Body() body: { conversationId: string; keyVersion: number; bundles: Array<{ userId: string; encryptedKey: string }> },
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const createdBy = user?.id ? String(user.id) : 'system';
      const result = await this.chatService.saveKeyBundle(
        body.conversationId,
        body.keyVersion || 1,
        body.bundles || [],
        createdBy
      );
      return res.status(HttpStatus.CREATED).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Get('keys/bundle/:conversationId')
  async getKeyBundle(
    @Param('conversationId') conversationId: string,
    @Query('version') versionStr: string,
    @Query('userId') queryUserId: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const targetUserId = queryUserId ? String(queryUserId) : (user?.id ? String(user.id) : undefined);
      if (!targetUserId) {
        return res.status(HttpStatus.UNAUTHORIZED).json({ success: false, message: 'Authentication required' });
      }
      const version = versionStr ? parseInt(versionStr, 10) : undefined;
      const bundle = await this.chatService.getKeyBundleForUser(conversationId, targetUserId, version);
      return res.status(HttpStatus.OK).json({ success: true, data: bundle });
    } catch (err: any) {
      const status = err?.status || HttpStatus.FORBIDDEN;
      return res.status(status).json({ success: false, message: err?.message });
    }
  }

  @Get('keys/bundles')
  async getAllKeyBundles(@Req() req: any, @Res() res: Response) {
    try {
      const user = req?.user;
      if (!user?.id) {
        return res.status(HttpStatus.UNAUTHORIZED).json({ success: false, message: 'Authentication required' });
      }
      const bundles = await this.chatService.getAllKeyBundlesForUser(String(user.id));
      return res.status(HttpStatus.OK).json({ success: true, data: bundles });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: err?.message, data: [] });
    }
  }

  @Post('messages')
  async saveMessage(
    @Body() dto: CreateChatMessageDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const result = await this.chatService.saveMessage(dto, user);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to save message',
      });
    }
  }

  @Post('messages/:id/react')
  async reactToMessage(
    @Param('id') id: string,
    @Body() dto: ReactMessageDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const userId = dto.userId || (user?.id ? String(user.id) : '5');
      const result = await this.chatService.reactToMessage(id, dto.emoji, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to update reaction',
      });
    }
  }

  @Patch('messages/:id/read')
  async markRead(
    @Param('id') id: string,
    @Body() body: { userId?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const userId = body?.userId ? String(body.userId) : (user?.id ? String(user.id) : undefined);
      const result = await this.chatService.markMessageRead(id, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to mark message read',
      });
    }
  }

  @Post('conversations/:id/read')
  async markConversationRead(
    @Param('id') id: string,
    @Body() body: { userId?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const userId = body?.userId ? String(body.userId) : (user?.id ? String(user.id) : '5');
      const result = await this.chatService.markConversationRead(id, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to mark conversation read',
      });
    }
  }

  @Post('conversations/:id/delivered')
  async markConversationDelivered(
    @Param('id') id: string,
    @Body() body: { userId?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const userId = body?.userId ? String(body.userId) : (user?.id ? String(user.id) : '5');
      const result = await this.chatService.markConversationDelivered(id, userId);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to mark conversation delivered',
      });
    }
  }

  // --- Notifications Endpoints ---

  @Get('notifications')
  async getNotifications(
    @Query('userId') userIdStr: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const targetUserId = userIdStr ? parseInt(userIdStr, 10) : (user?.id ? user.id : 5);
      const notifications = await this.chatService.getNotifications(targetUserId);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: notifications,
      });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err?.message || 'Failed to fetch notifications',
        data: [],
      });
    }
  }

  @Post('notifications')
  async createNotification(
    @Body() dto: any,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const result = await this.chatService.createNotification(dto, user);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to create notification',
      });
    }
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.chatService.markNotificationRead(id);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to mark notification read',
      });
    }
  }

  @Post('notifications/mark-all-read')
  async markAllNotificationsRead(
    @Body('userId') userIdStr: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = req?.user;
      const targetUserId = userIdStr ? parseInt(userIdStr, 10) : (user?.id ? user.id : 5);
      const result = await this.chatService.markAllNotificationsRead(targetUserId);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err?.message || 'Failed to mark all notifications read',
      });
    }
  }

  // ==========================================
  // AUTH PROFILE & TASKING INTEGRATION (CHATTASK)
  // Protected with ChatJwtGuard (Bearer + Cookie)
  // ==========================================

  @Get('me')
  async getChatProfile(@Req() req: any, @Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      success: true,
      user: req?.user || null,
    });
  }

  @Get('tasks/list')
  async listTasks(@Query() query: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const data = await this.tasksService.findAll(query, req.user);
      return res.status(HttpStatus.OK).json({ success: true, ...data });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: err?.message, data: [] });
    }
  }

  @Get('tasks/:id')
  async getTask(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const task = await this.tasksService.findOne(+id, req.user);
      return res.status(HttpStatus.OK).json({ success: true, data: task });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: err?.message });
    }
  }

  @Post('tasks')
  async createTask(@Body() body: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const task = await this.tasksService.create(body, req.user);
      return res.status(HttpStatus.CREATED).json({ success: true, data: task });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Patch('tasks/:id')
  async updateTask(@Param('id') id: string, @Body() body: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const task = await this.tasksService.update(+id, body, req.user);
      return res.status(HttpStatus.OK).json({ success: true, data: task });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Post('tasks/:id/progress')
  @Patch('tasks/:id/progress')
  async updateTaskProgress(@Param('id') id: string, @Body() body: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const task = await this.tasksService.updateProgress(+id, body, req.user);
      return res.status(HttpStatus.OK).json({ success: true, data: task });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Post('tasks/:id/comments')
  async addTaskComment(@Param('id') id: string, @Body() body: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const comment = await this.tasksService.addComment(+id, body, req.user);
      return res.status(HttpStatus.OK).json({ success: true, data: comment });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Post('tasks/:id/approve')
  async approveTask(@Param('id') id: string, @Body() body: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const task = await this.tasksService.approve(+id, body, req.user);
      return res.status(HttpStatus.OK).json({ success: true, data: task });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }

  @Post('tasks/:id/status-transition')
  async transitionTaskStatus(@Param('id') id: string, @Body() body: any, @Req() req: any, @Res() res: Response) {
    try {
      if (!this.tasksService) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'TasksService not available' });
      }
      const task = await this.tasksService.transitionStatus(+id, body, req.user);
      return res.status(HttpStatus.OK).json({ success: true, data: task });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: err?.message });
    }
  }
}
