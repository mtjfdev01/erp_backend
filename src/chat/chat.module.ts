import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { UserE2eeKeyEntity } from './entities/user-e2ee-key.entity';
import { ConversationKeyBundleEntity } from './entities/conversation-key-bundle.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatJwtGuard } from './guards/chat-jwt.guard';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatMessageEntity,
      ConversationEntity,
      UserE2eeKeyEntity,
      ConversationKeyBundleEntity,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    }),
    forwardRef(() => TasksModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatJwtGuard],
  exports: [ChatService, ChatGateway, ChatJwtGuard],
})
export class ChatModule {}
