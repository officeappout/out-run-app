'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChatThread } from '../types/chat.types';

function tsToDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date();
}

/**
 * Real-time subscription to all DM threads where the current user is a participant.
 * Sorted by lastMessageAt DESC (most recent first).
 */
export function useChatInbox(myUid: string | null) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Total unread count across all threads
  const totalUnread = threads.reduce(
    (sum, t) => sum + (t.unreadCount?.[myUid ?? ''] ?? 0),
    0,
  );

  useEffect(() => {
    if (!myUid) {
      setThreads([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', myUid),
      orderBy('lastMessageAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const data: ChatThread[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChatThread, 'id' | 'lastMessageAt' | 'createdAt'>),
        lastMessageAt: tsToDate(d.data().lastMessageAt),
        createdAt: tsToDate(d.data().createdAt),
      }));
      setThreads(data);
      setIsLoading(false);
    });

    return unsub;
  }, [myUid]);

  return { threads, isLoading, totalUnread };
}
