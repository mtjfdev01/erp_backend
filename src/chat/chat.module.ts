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
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}

