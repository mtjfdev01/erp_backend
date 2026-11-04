import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ConditionalJwtGuard } from '../auth/guards/conditional-jwt.guard';

@Controller('chat')
@UseGuards(ConditionalJwtGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@Req() req: any, @Res() res: Response) {
    try {
      const user = req?.user;
      const conversations = await this.chatService.getConversations(
        user?.id ? String(user.id) : undefined
      );
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
    @Res() res: Response
  ) {
    try {
      const limit = limitStr ? parseInt(limitStr, 10) : 2000;
      const messages = await this.chatService.getAllMessages(limit);
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
    @Res() res: Response
  ) {
    try {
      const limit = limitStr ? parseInt(limitStr, 10) : 500;
      const messages = await this.chatService.getMessagesByChat(chatId, limit);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: messages,
      });
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err?.message || 'Failed to fetch messages for chat',
        data: [],
      });
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
  async markRead(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.chatService.markMessageRead(id);
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
}
