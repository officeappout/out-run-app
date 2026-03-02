/**
 * Pillar 5 — Messaging types
 * Firestore path: chats/{chatId}  /  chats/{chatId}/messages/{messageId}
 */

export type ChatMessageType = 'text' | 'high_five';

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  sentAt: Date;
  readBy: string[];
  type: ChatMessageType;
}

export interface ChatThread {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;   // uid → displayName
  lastMessage: string;
  lastMessageAt: Date;
  lastSenderId: string;
  unreadCount: Record<string, number>;        // uid → count
  createdAt: Date;
  type: 'dm' | 'group';
  /** Present only for group chats — links back to community_groups/{groupId} */
  groupId?: string;
  groupName?: string;
}
