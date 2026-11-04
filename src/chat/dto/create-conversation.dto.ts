export class CreateConversationDto {
  id?: string;
  name: string;
  type?: 'direct' | 'group' | 'channel';
  avatarBg?: string;
  participantIds?: string[];
  adminIds?: string[];
  department?: string;
  linkedTaskId?: string;
  isPinned?: boolean;
  description?: string;
  lastMessage?: any;
  unreadCounts?: Record<string, number>;
}
