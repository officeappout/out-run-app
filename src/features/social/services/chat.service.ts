/**
 * Pillar 5 — Chat Service
 *
 * Firestore schema:
 *   chats/{chatId}                 — thread metadata
 *   chats/{chatId}/messages/{id}   — individual messages
 *
 * Chat ID convention: [uid1, uid2].sort().join('_')
 * This guarantees exactly one DM thread per pair, no duplicates.
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChatThread, ChatMessage } from '../types/chat.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

function tsToDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the chat thread between two users, creating it if it doesn't exist.
 */
export async function getOrCreateChat(
  myUid: string,
  myName: string,
  theirUid: string,
  theirName: string,
): Promise<ChatThread> {
  const chatId = makeChatId(myUid, theirUid);
  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);

  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as ChatThread;
  }

  const newThread = {
    participants: [myUid, theirUid],
    participantNames: { [myUid]: myName, [theirUid]: theirName },
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastSenderId: myUid,
    unreadCount: { [myUid]: 0, [theirUid]: 0 },
    createdAt: serverTimestamp(),
    type: 'dm' as const,
  };

  await setDoc(chatRef, newThread);
  return { id: chatId, ...newThread, lastMessageAt: new Date(), createdAt: new Date() } as ChatThread;
}

/**
 * Sends a message to an existing chat thread.
 */
export async function sendMessage(
  chatId: string,
  senderUid: string,
  senderName: string,
  text: string,
  type: 'text' | 'high_five' = 'text',
): Promise<void> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const chatRef = doc(db, 'chats', chatId);

  const chatSnap = await getDoc(chatRef);
  const participants: string[] = chatSnap.data()?.participants ?? [];

  await addDoc(messagesRef, {
    senderUid,
    senderName,
    text,
    sentAt: serverTimestamp(),
    readBy: [senderUid],
    type,
  });

  const unreadUpdates: Record<string, unknown> = {};
  for (const uid of participants) {
    if (uid !== senderUid) {
      unreadUpdates[`unreadCount.${uid}`] = increment(1);
    }
  }

  await updateDoc(chatRef, {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderUid,
    ...unreadUpdates,
  });
}

/**
 * Subscribe to the latest messages in a chat thread (real-time).
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(
  chatId: string,
  onUpdate: (messages: ChatMessage[]) => void,
  messageLimit = 50,
): () => void {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('sentAt', 'desc'),
    limit(messageLimit),
  );

  return onSnapshot(q, (snap) => {
    const messages: ChatMessage[] = snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChatMessage, 'id' | 'sentAt'>),
        sentAt: tsToDate(d.data().sentAt),
      }))
      .reverse(); // show oldest at top
    onUpdate(messages);
  });
}

/**
 * Mark all unread messages in a thread as read by the current user.
 */
export async function markThreadAsRead(chatId: string, myUid: string): Promise<void> {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    [`unreadCount.${myUid}`]: 0,
  });
}

/**
 * Mark individual message as read (adds uid to readBy array).
 */
export async function markMessageRead(
  chatId: string,
  messageId: string,
  myUid: string,
): Promise<void> {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  await updateDoc(msgRef, { readBy: arrayUnion(myUid) });
}

// ─── Group Chat API ───────────────────────────────────────────────────────────

function makeGroupChatId(groupId: string): string {
  return `group_${groupId}`;
}

/**
 * Creates a chat thread for a community group.
 * Called automatically when a group is created.
 */
export async function createGroupChat(
  groupId: string,
  groupName: string,
  creatorUid: string,
  creatorName: string,
): Promise<string> {
  const chatId = makeGroupChatId(groupId);
  const chatRef = doc(db, 'chats', chatId);

  await setDoc(chatRef, {
    participants: [creatorUid],
    participantNames: { [creatorUid]: creatorName },
    lastMessage: `${creatorName} יצר/ה את הקבוצה`,
    lastMessageAt: serverTimestamp(),
    lastSenderId: creatorUid,
    unreadCount: {},
    createdAt: serverTimestamp(),
    type: 'group',
    groupId,
    groupName,
  });

  return chatId;
}

/**
 * Adds a member to an existing group chat thread.
 * If the chat document is missing this throws — the caller (joinGroup /
 * joinEvent) catches and falls back to createGroupChat().
 * The update is intentionally simple so it matches the Firestore rule:
 *   "group chat update: user in request.resource.data.participants"
 */
export async function addMemberToGroupChat(
  groupId: string,
  uid: string,
  name: string,
): Promise<void> {
  const chatId = makeGroupChatId(groupId);
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    participants: arrayUnion(uid),
    [`participantNames.${uid}`]: name,
  });
}

/**
 * Removes a member from a group's chat thread.
 */
export async function removeMemberFromGroupChat(
  groupId: string,
  uid: string,
): Promise<void> {
  const chatId = makeGroupChatId(groupId);
  const chatRef = doc(db, 'chats', chatId);

  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;

  const data = snap.data();
  const updatedParticipants = (data.participants as string[]).filter((p) => p !== uid);
  const updatedNames = { ...(data.participantNames as Record<string, string>) };
  delete updatedNames[uid];

  await updateDoc(chatRef, {
    participants: updatedParticipants,
    participantNames: updatedNames,
  });
}
