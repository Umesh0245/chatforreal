import Dexie, { type Table } from 'dexie';

export interface Conversation {
  id: string; // Room ID or Peer ID
  partnerUid: string;
  partnerName: string;
  encryptionKey: string; // Base64 encoded AES key
  lastMessage?: string;
  lastMessageTime?: number;
  updatedAt: number;
  isBlocked: number; // 0 or 1
}

export interface Message {
  id?: number;
  conversationId: string;
  senderUid: string;
  encryptedText: string;
  timestamp: number;
  isRead: number; // 0 or 1
  isSynced?: number; // 0 or 1, for signal confirmation
}

export interface OutboxItem {
  id?: number;
  conversationId: string;
  data: any; // The raw data to send via peer
  timestamp: number;
}

export class GhostChatDB extends Dexie {
  conversations!: Table<Conversation>;
  messages!: Table<Message>;
  outbox!: Table<OutboxItem>;

  constructor() {
    super('GhostChatDB');
    this.version(3).stores({
      conversations: 'id, partnerUid, updatedAt, isBlocked',
      messages: '++id, conversationId, timestamp, senderUid, isSynced',
      outbox: '++id, conversationId, timestamp'
    });
  }
}

export const db = new GhostChatDB();

// Cleanup function for 5-day expiry
export async function cleanupOldMessages() {
  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
  await db.messages.where('timestamp').below(fiveDaysAgo).delete();
}
