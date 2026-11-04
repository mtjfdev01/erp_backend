export class CreateChatMessageDto {
  id?: string;
  chatId: string;
  senderId?: string;
  text: string;
  type?: string;
  status?: string;
  timestamp?: string;
  replyTo?: any;
  attachment?: any;
  voiceDuration?: number;
  taskId?: string;
  linkedTaskId?: string;
  mentions?: string[];
  reactions?: any[];
}

export class ReactMessageDto {
  emoji: string;
  userId: string;
}
